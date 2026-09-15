import { logActivityFor } from "../../lib/activity";
import { getWorkspaceFor, putWorkspaceFor } from "../../lib/workspace";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { callAi, extractJson } from "../../lib/ai";
import { getEnv, readPillars, readPostingTimes } from "../../lib/settings";
import { getWorkspace, putWorkspace } from "../../lib/workspace";

/**
 * POST /api/generate-plan { month: "YYYY-MM", notes?: string }
 *
 * The `planner` agent from `.claude/agents/planner.md`, implemented: the model
 * lays out the month against the user's pillars and posting cadence, and the
 * result is stored as `workspace` key `calendar_YYYY-MM` (the pattern the
 * original design specified — no migration needed).
 */

const bodySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Month must look like 2026-09"),
  notes: z.string().trim().max(500).optional(),
});

export type PlanEntry = {
  date: string;
  weekday: string;
  type: "Reel" | "Carousel" | "Story" | string;
  topic: string;
  pillar: string;
  time: string;
};

export const Route = createFileRoute("/api/generate-plan")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
            { status: 400 },
          );
        }
        const { month, notes } = parsed.data;

        const [pillars, times] = await Promise.all([
          readPillars(env),
          readPostingTimes(env),
        ]);

        const prompt = buildPrompt({ month, pillars, times, notes });
        let text = "";
        let entries: PlanEntry[] | null = null;

        // One retry: the model occasionally wraps its JSON in prose or returns
        // something truncated. Recovering here is cheap; failing the whole
        // request on one bad sample is not.
        for (let attempt = 1; attempt <= 2 && !entries; attempt++) {
          try {
            text = await callAi(
              env,
              attempt === 1
                ? prompt
                : `${prompt}\n\nIMPORTANT: reply with the JSON object only — no prose, no code fences.`,
              { maxTokens: 2400 },
            );
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 502 },
            );
          }
          const parsed = extractJson<{ entries?: PlanEntry[] }>(text);
          entries =
            Array.isArray(parsed?.entries) && parsed!.entries!.length > 0
              ? parsed!.entries!
              : null;
        }

        if (!entries || entries.length === 0) {
          return Response.json(
            {
              ok: false,
              error: "The model did not return a usable plan.",
              raw: text.slice(0, 1500),
            },
            { status: 502 },
          );
        }

        const cleaned: PlanEntry[] = entries
          .filter((e) => typeof e?.date === "string" && month === e.date.slice(0, 7))
          .map((e) => ({
            date: e.date,
            weekday: weekdayName(e.date),
            type: String(e.type ?? "Reel"),
            topic: String(e.topic ?? "").slice(0, 140),
            pillar: String(e.pillar ?? ""),
            time: normalizeTime(e.time, String(e.type ?? "Reel"), times),
          }))
          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

        if (cleaned.length === 0) {
          return Response.json(
            { ok: false, error: `The model returned no dates inside ${month}.` },
            { status: 502 },
          );
        }

        const calendar = {
          month,
          generated_at: Date.now(),
          pillars,
          posting_times: times,
          notes: notes ?? "",
          entries: cleaned,
          // Soft rules the model did not follow — shown rather than hidden.
          warnings: buildWarnings(cleaned, pillars),
        };

        const saved = await putWorkspaceFor(request, context, `calendar_${month}`, calendar);
        if (!saved) {
          return Response.json(
            { ok: false, error: "Could not save the calendar" },
            { status: 500 },
          );
        }

        await logActivityFor(
          request,
          context,
          "planner",
          "plan_generated",
          `calendar_${month} · ${cleaned.length} entries`,
        );

        // Read back so the client renders exactly what was stored.
        const stored = await getWorkspaceFor<any>(request, context, `calendar_${month}`);
        return Response.json({ ok: true, calendar: stored ?? calendar });
      },
    },
  },
});

/** Soft-rule checks, surfaced instead of silently ignored. */
function buildWarnings(entries: PlanEntry[], pillars: string[]): string[] {
  const out: string[] = [];
  const isReel = (e: PlanEntry) => /reel/i.test(e.type);
  const HIGH_PRIORITY = [1, 3, 5]; // Monday, Wednesday, Friday

  const highDays = entries.filter((e) =>
    HIGH_PRIORITY.includes(new Date(`${e.date}T00:00:00Z`).getUTCDay()),
  );
  const missed = highDays.filter((e) => !isReel(e));
  if (missed.length) {
    out.push(
      `${missed.length} high-priority day(s) (Mon/Wed/Fri) have no Reel: ${missed
        .slice(0, 4)
        .map((e) => e.date)
        .join(", ")}`,
    );
  }

  const reelDates = [...new Set(entries.filter(isReel).map((e) => e.date))].sort();
  for (let i = 1; i < reelDates.length; i++) {
    const gap =
      (new Date(`${reelDates[i]}T00:00:00Z`).getTime() -
        new Date(`${reelDates[i - 1]}T00:00:00Z`).getTime()) /
      86_400_000;
    if (gap <= 1) {
      out.push(`Reels on back-to-back days: ${reelDates[i - 1]} and ${reelDates[i]}`);
    }
  }

  const used = new Set(entries.map((e) => e.pillar));
  const unused = pillars.filter((p) => !used.has(p));
  if (unused.length) out.push(`Pillars not used this month: ${unused.join(", ")}`);

  return out.slice(0, 5);
}

function weekdayName(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] ?? "";
}

function normalizeTime(
  value: unknown,
  type: string,
  times: { reel: string; story: string; carousel: string },
): string {
  const v = String(value ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  const t = type.toLowerCase();
  if (t.includes("story")) return times.story;
  if (t.includes("carousel")) return times.carousel;
  return times.reel;
}

function buildPrompt(d: {
  month: string;
  pillars: string[];
  times: { reel: string; story: string; carousel: string };
  notes?: string;
}): string {
  return `You are the content planner for a solo short-form video creator (Instagram Reels / YouTube Shorts, brand "JepyLabs", handle @enzorico.ai). Plan the month ${d.month}.

Return ONLY JSON:
{"entries":[{"date":"YYYY-MM-DD","type":"Reel|Carousel|Story","topic":"specific post idea","pillar":"one of the pillars","time":"HH:MM"}]}

Hard rules:
- Every date must be inside ${d.month}.
- Reels land at ${d.times.reel}, Stories at ${d.times.story}, Carousels at ${d.times.carousel} (24h, Asia/Dhaka local time).
- Monday, Wednesday and Friday are high-priority days: always put a Reel there.
- Never schedule two Reels on back-to-back days.
- Weekends stay light: at most one Story each.
- Rotate the pillars evenly and always set "pillar" to one of: ${d.pillars.join(", ")}.
- Topics must be concrete and shootable ("3 AI prompts that write my captions"), never generic ("post about AI").
- Aim for 12-18 entries for the month; at most 2 entries on any single day.

${d.notes ? `Extra direction from the creator: ${d.notes}\n` : ""}Today is ${new Date().toISOString().slice(0, 10)}; do not plan dates in the past.`;
}
