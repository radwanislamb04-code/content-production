import { currentUserId } from "../../lib/users";
import { putWorkspaceFor } from "../../lib/workspace";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { callAi, extractJson } from "../../lib/ai";
import { getEnv } from "../../lib/settings";
import { putWorkspace } from "../../lib/workspace";

/**
 * POST /api/thumbnail-prompt — turn a script into thumbnail art direction.
 *
 * Text-only on purpose: thumbnail *images* are made outside the app right now
 * (Gemini / ChatGPT / arena.ai — the studio copies the prompt and opens the
 * site), so this needs nothing from the paused Workers AI image path.
 */

const bodySchema = z.object({
  script: z.string().trim().min(10).max(20000),
  style: z.string().trim().max(200).optional(),
  /** Optional id so the result is remembered in `workspace`. */
  saveId: z.string().trim().max(80).optional(),
});

export type ThumbnailPrompt = {
  headline: string;
  subline: string;
  background_prompt: string;
  character_note: string;
  text_style: string;
  colour_notes: string;
  full_prompt: string;
};

export const Route = createFileRoute("/api/thumbnail-prompt")({
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
            { ok: false, error: "Paste a script first (at least a few words)." },
            { status: 400 },
          );
        }
        const { script, style, saveId } = parsed.data;

        const prompt = buildPrompt(script, style);

        let text: string;
        try {
          text = await callAi(env, prompt, {
            userId: await currentUserId(request, context), maxTokens: 900 });
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 502 },
          );
        }

        const result = extractJson<ThumbnailPrompt>(text);
        if (!result || !result.full_prompt) {
          // Never pretend: hand the raw answer back so the panel can show it.
          return Response.json(
            {
              ok: false,
              error: "The model did not return usable JSON — here is its raw answer.",
              raw: text,
            },
            { status: 502 },
          );
        }

        const normalized: ThumbnailPrompt = {
          headline: String(result.headline ?? "").slice(0, 80),
          subline: String(result.subline ?? "").slice(0, 80),
          background_prompt: String(result.background_prompt ?? ""),
          character_note: String(result.character_note ?? ""),
          text_style: String(result.text_style ?? ""),
          colour_notes: String(result.colour_notes ?? ""),
          full_prompt: String(result.full_prompt ?? ""),
        };

        if (saveId) {
          await putWorkspaceFor(request, context, `thumb_prompt_${saveId}`, {
            at: Date.now(),
            script: script.slice(0, 4000),
            style: style ?? "",
            prompt: normalized,
          });
        }

        return Response.json({ ok: true, prompt: normalized });
      },
    },
  },
});

function buildPrompt(script: string, style?: string): string {
  return `You write thumbnail art direction for a solo creator's short-form videos (brand "Content OS", handle @enzorico.ai). Produce ONE image-generation prompt that a designer or an image model can follow.

Return ONLY JSON, no prose, exactly these keys:
{"headline":"3-5 words that go on the thumbnail","subline":"max 6 words, or an empty string","background_prompt":"the scene only, no text","character_note":"how the person should look/pose, or an empty string","text_style":"font weight/placement advice","colour_notes":"palette and contrast","full_prompt":"one paragraph: subject, framing, lighting, palette, background, mood, text placement, lens, 3:2 thumbnail"}

Rules:
- The headline must create curiosity without lying; 5 words or fewer.
- background_prompt describes the scene only — no lettering.
- full_prompt under 120 words; mention "3:2 thumbnail"; no real people, no brand names.
- Write in the same language as the script (English script, English output).

SCRIPT
---
${script.slice(0, 8000)}
---
STYLE PREFERENCE: ${style?.trim() || "none given"}`;
}
