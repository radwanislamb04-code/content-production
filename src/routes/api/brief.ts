import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { dhakaDateKey, runPipeline } from "../../lib/pipeline";
import { getEnv } from "../../lib/settings";
import { getWorkspaceFor } from "../../lib/workspace";

/** Readable one-liner for a stored brief, so the history list is not just dates. */
const HEADINGS = [
  "TODAY'S PICKS",
  "TRENDING NOW",
  "COMPETITOR WATCH",
  "HOOK IDEAS",
  "ACTION ITEMS",
];

function previewOf(raw: unknown, max = 110): string {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const md = String((value as any)?.markdown ?? "");
    const lines = md
      .split("\n")
      .map((l: string) =>
        l
          .replace(/^[-•*#\s]+/, "")
          .replace(/[*#:]+$/, "")
          .replace(/\*\*/g, "")
          .trim(),
      )
      .filter((l: string) => {
        if (!l) return false;
        const bare = l
          .replace(/[*#:]+$/g, "")
          .trim()
          .toUpperCase();
        // Skip the brief's own section labels so the preview shows content.
        if (HEADINGS.includes(bare)) return false;
        if (lettersOf(l) >= 4 && l === l.toUpperCase()) return false;
        return true;
      });
    return (lines[0] ?? "").slice(0, max);
  } catch {
    return "";
  }
}

function lettersOf(s: string): number {
  return s.replace(/[^A-Za-z]/g, "").length;
}

/**
 * GET  /api/brief            — today's brief + the history index
 * GET  /api/brief?date=YYYY-MM-DD — one specific brief
 * POST /api/brief-generate   — compose today's brief now (no Telegram send)
 *
 * Briefs live in the `workspace` table under `brief_YYYY-MM-DD` (the same
 * pattern the planner uses for `calendar_YYYY-MM`), so no migration was needed.
 */
export const Route = createFileRoute("/api/brief")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const wanted = url.searchParams.get("date");
        const dateKey = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : dhakaDateKey();

        const brief = await getWorkspaceFor<any>(request, context, `brief_${dateKey}`);

        // History with a real preview — `listWorkspaceKeys` returns no values, so
        // the page could only ever show bare dates. A brief is small (~7 KB), so
        // reading the last 30 values is cheap.
        let history: { date: string; updated_at: number; preview: string }[] = [];
        try {
          // The user id MUST be bound: adding the predicate without the argument
          // silently returned zero history rows.
          const uid = await currentUserId(request, context);
          const { results } = await env.DB.prepare(
            "SELECT key, value, updated_at FROM workspace WHERE user_id = ? AND key LIKE 'brief_%' ORDER BY key DESC LIMIT 30",
          )
            .bind(uid)
            .all();
          history = (results ?? []).map((r: any) => ({
            date: String(r.key).replace(/^brief_/, ""),
            updated_at: Number(r.updated_at),
            preview: previewOf(r.value),
          }));
        } catch {
          history = [];
        }

        return Response.json({
          ok: true,
          date: dateKey,
          today: dhakaDateKey(),
          brief,
          history,
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        // Reuse the pipeline so the run is logged in `activity` like any other.
        const report = await runPipeline(env, ["brief"]);
        const step = report.steps.find((s) => s.step === "brief");
        if (!step?.ok) {
          return Response.json(
            { ok: false, error: step?.detail ?? "Brief generation failed" },
            { status: 502 },
          );
        }
        const dateKey = dhakaDateKey();
        const brief = await getWorkspaceFor<any>(request, context, `brief_${dateKey}`);
        return Response.json({ ok: true, date: dateKey, brief, detail: step.detail });
      },
    },
  },
});
