import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { callAi, extractJson } from "../../lib/ai";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { logActivity } from "../../lib/activity";

/**
 * POST /api/platform-variants { id }
 *
 * ⑦ of the master plan — one script, three platforms. Shorts, Reels and TikTok
 * reward different things (a Shorts hook is spoken in the first second, a Reels
 * hook is a caption line, TikTok leans on a text overlay), so this is a real
 * rewrite rather than a rename.
 *
 * The three variants are saved as their own library items (type `script`,
 * `source_id` pointing at the original) so they show up in the Library, can be
 * edited and can be scored — nothing is returned that you cannot keep.
 */

const bodySchema = z.object({ id: z.string().trim().min(1).max(120) });

type Variant = {
  platform: string;
  hook: string;
  script: string;
  caption?: string;
  hashtags?: string[];
  notes?: string;
};

const PLATFORMS = ["YouTube Shorts", "Instagram Reels", "TikTok"];

function buildPrompt(title: string, content: string): string {
  return [
    "You are a short-form video scriptwriter who adapts one script for three platforms.",
    "",
    `SOURCE TITLE: ${title}`,
    "SOURCE SCRIPT:",
    content.slice(0, 6000),
    "",
    "Rewrite it three times, once per platform, in the platform's own idiom:",
    "- YouTube Shorts: hook spoken in the first 1-2 seconds, tight 45-60s arc, spoken CTA.",
    "- Instagram Reels: hook as a caption line, more visual/loopable, save/share CTA.",
    "- TikTok: hook as an on-screen text overlay, more conversational, sound-aware.",
    "",
    "Keep the same core idea and facts. Do not invent statistics, prices or claims",
    "that are not in the source. Reply with JSON only:",
    `{"variants":[{"platform":"YouTube Shorts","hook":"...","script":"...","caption":"...","hashtags":["..."],"notes":"..."},` +
      `{"platform":"Instagram Reels",...},{"platform":"TikTok",...}]}`,
  ].join("\n");
}

function formatContent(v: Variant): string {
  const lines = [
    `PLATFORM: ${v.platform}`,
    "",
    "HOOK",
    String(v.hook ?? "").trim(),
    "",
    "SCRIPT",
    String(v.script ?? "").trim(),
  ];
  if (v.caption) lines.push("", "CAPTION", String(v.caption).trim());
  if (Array.isArray(v.hashtags) && v.hashtags.length) {
    lines.push(
      "",
      "HASHTAGS",
      v.hashtags
        .map((h) => (String(h).startsWith("#") ? String(h) : `#${h}`))
        .join(" "),
    );
  }
  if (v.notes) lines.push("", "NOTES", String(v.notes).trim());
  return lines.join("\n");
}

export const Route = createFileRoute("/api/platform-variants")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "D1 is not bound" }, { status: 500 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Pass the item id" }, { status: 400 });
        }

        const userId = await currentUserId(request, context);

        let item: any = null;
        try {
          item = await db
            .prepare(
              "SELECT id, type, title, content, content_pillar FROM library WHERE id = ? AND user_id = ?",
            )
            .bind(parsed.data.id, userId)
            .first();
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
        if (!item) {
          return Response.json({ ok: false, error: "Item not found" }, { status: 404 });
        }

        const title = String(item.title ?? "Untitled");
        const content =
          typeof item.content === "string"
            ? item.content
            : JSON.stringify(item.content ?? "", null, 2);

        if (content.trim().length < 40) {
          return Response.json(
            {
              ok: false,
              error:
                "This item is too short to adapt — open it and add the script body first.",
            },
            { status: 400 },
          );
        }

        const prompt = buildPrompt(title, content);
        let variants: Variant[] | null = null;
        let rawText = "";
        for (let attempt = 1; attempt <= 2 && !variants; attempt++) {
          try {
            rawText = await callAi(
              env,
              attempt === 1
                ? prompt
                : `${prompt}\n\nIMPORTANT: reply with the JSON object only — no prose, no code fences.`,
              { maxTokens: 2600, userId },
            );
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 502 },
            );
          }
          const got = extractJson<{ variants?: Variant[] }>(rawText);
          if (got && Array.isArray(got.variants) && got.variants.length) {
            variants = got.variants.filter((v) => v && (v.script || v.hook));
          }
        }

        if (!variants?.length) {
          return Response.json(
            {
              ok: false,
              error: "The model did not return usable variants.",
              raw: rawText.slice(0, 800),
            },
            { status: 502 },
          );
        }

        const created: Array<{ id: string; title: string; platform: string }> = [];
        const failures: string[] = [];
        for (const variant of variants.slice(0, 3)) {
          const platform = String(variant.platform ?? PLATFORMS[created.length] ?? "Variant");
          const rowTitle = `${title} — ${platform}`.slice(0, 200);
          const id = crypto.randomUUID();
          try {
            await db
              .prepare(
                `INSERT INTO library
                   (id, type, title, content, created_at, updated_at, user_id,
                    quality_score, status, content_pillar, source_id)
                 VALUES (?, 'script', ?, ?, ?, ?, ?, 0, 'draft', ?, ?)`,
              )
              .bind(
                id,
                rowTitle,
                formatContent(variant),
                Date.now(),
                Date.now(),
                userId,
                item.content_pillar ?? null,
                item.id,
              )
              .run();
            created.push({ id, title: rowTitle, platform });
          } catch (err: any) {
            failures.push(`${platform}: ${err?.message ?? "insert failed"}`);
          }
        }

        await logActivity(
          env,
          "platform-variants",
          created.length ? "created" : "failed",
          `${item.id} → ${created.map((c) => c.platform).join(", ") || failures.join("; ")}`,
          userId,
        );

        return Response.json({
          ok: created.length > 0,
          source: { id: item.id, title },
          created,
          failures,
          variants,
        });
      },
    },
  },
});
