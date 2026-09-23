import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { readAiConfig, anthropicMessagesUrl } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

// Same skill file as hook-script-writer.ts, same single source (src/lib/skills.ts).
import { VIRAL_HOOK_SCRIPT_WRITER_SKILL } from "../../lib/skills";

type Hook = {
  spoken: string;
  formula: string;
  visual: string;
  text_overlay: string;
};

type AnalyzerPayload = {
  hooks: Hook[];
  full_script: string;
  title: string;
  description: string;
  hashtags: string[];
  formatted?: string;
  voiceover_script?: string;
};


const JSON_SHAPE_INSTRUCTION = `Deliver your response in TWO parts, in this order:

PART 1 — Produce the complete script using the skill's exact "STEP 5 — Output Format" structure (the block that begins with "🎬 TITLE/IDEA:"). Include every field: MODE, TARGET VIEWER, PAYOFF, LENGTH, the 3 HOOK OPTIONS (each with spoken line + formula + Visual + Text overlay), FULL SCRIPT with timestamped beats, CAPTION, COMMENT BAIT, and FIRST-FRAME NOTE.

PART 2 — After PART 1, on a new line, output a single JSON code block (fenced with \`\`\`json) with this EXACT shape:

\`\`\`json
{
  "hooks": [
    { "spoken": "spoken line 1", "formula": "hook formula name", "visual": "visual note", "text_overlay": "on-screen text" },
    { "spoken": "spoken line 2", "formula": "...", "visual": "...", "text_overlay": "..." },
    { "spoken": "spoken line 3", "formula": "...", "visual": "...", "text_overlay": "..." }
  ],
  "full_script": "the entire timestamped script (hook + setup + delivery + cta beats) combined as one string with \\n line breaks between beats",
  "title": "a suggested viral title for the video",
  "description": "the caption text from the CAPTION field, ready to paste as the post description",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}
\`\`\`

The JSON must contain exactly 3 hook objects, the hashtags array must contain 3-5 niche hashtags (no # prefix needed, but keep them if the model prefers), be valid and parseable, and match the shape above exactly.`;

function buildTranscriptPrompt(content: string): string {
  return `You are given a transcript / reference script from an existing short-form video. Analyze it, then produce a NEW, IMPROVED viral version of the same idea — do not just rewrite the words, actually apply the full "Viral Hook & Script Writer" system from your system instructions (proof-first, triple-layer hook, re-hooks, escalation, one CTA, etc.).

REFERENCE TRANSCRIPT / SCRIPT:
${content}

Your job: extract the core idea/payoff from the reference, then write a stronger viral version that would out-perform it on Instagram Reels. Keep the same underlying topic and audience, but upgrade the hook, structure, pacing, proof, and CTA.

${JSON_SHAPE_INSTRUCTION}`;
}

function buildCustomIdeaPrompt(content: string): string {
  return `Write a viral short-form video script from scratch for the following idea/topic. Apply the full "Viral Hook & Script Writer" system from your system instructions.

IDEA / TOPIC:
${content}

${JSON_SHAPE_INSTRUCTION}`;
}

function buildVoiceoverScript(payload: AnalyzerPayload): string {
  const spokenLines: string[] = [];
  for (const h of payload.hooks || []) {
    if (h.spoken) spokenLines.push(h.spoken.trim());
  }
  if (payload.full_script) {
    for (const line of payload.full_script.split("\n")) {
      // Take everything before first " | " (annotation separator)
      const spokenPart = line.split(" | ")[0].trim();
      // Remove timestamp markers like [0-3s] or [last 3-5s]
      const noTimestamp = spokenPart.replace(/^\[[^\]]+\]\s+/, "").trim();
      // Remove leading emoji markers (⚡, 🎞, etc.) - can be multiple
      const noEmoji = noTimestamp.replace(/^([⚡⚠🎮📇🔥]+\s*)*/, "").trim();
      // Remove any label ending with colon (match everything up to first colon)
      // Handles: HOOK:, SETUP/PROOF:, DELIVERY:, RE-HOOK ⚡:, ESCALATION ⚡:, PAYOFF:, CTA:, etc.
      const noLabel = noEmoji.replace(/^[^:]*:\s*/, "").trim();
      // Remove any remaining bracket annotations like [something]
      const noBrackets = noLabel.replace(/\[[^\]]*\]/g, "").trim();
      // Strip surrounding quotes if present (both "..." and '...')
      const unquoted = noBrackets.replace(/^["'](.*)["']$/, "$1").trim();
      if (unquoted) spokenLines.push(unquoted);
    }
  }
  const unique = spokenLines.filter((v, i, a) => a.indexOf(v) === i);
  return unique.join(" ");
}

function extractAnalyzerPayload(rawText: string): AnalyzerPayload | null {
  if (!rawText) return null;

  // Collect JSON candidates: every fenced code block, then a last-resort
  // "biggest {...} slice" fallback if no fence parses.
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(rawText)) !== null) {
    candidates.push(m[1]);
  }
  const firstOpen = rawText.indexOf("{");
  const lastClose = rawText.lastIndexOf("}");
  if (firstOpen !== -1 && lastClose > firstOpen) {
    candidates.push(rawText.slice(firstOpen, lastClose + 1));
  }

  for (const candidate of candidates) {
    const cleaned = candidate.trim();
    if (!cleaned) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const r = parsed as Record<string, unknown>;

    if (!Array.isArray(r.hooks)) continue;
    const hooks = r.hooks
      .map((h): Hook | null => {
        if (!h || typeof h !== "object") return null;
        const hr = h as Record<string, unknown>;
        const spoken = typeof hr.spoken === "string" ? hr.spoken : "";
        const formula = typeof hr.formula === "string" ? hr.formula : "";
        const visual = typeof hr.visual === "string" ? hr.visual : "";
        const text_overlay = typeof hr.text_overlay === "string" ? hr.text_overlay : "";
        if (!spoken) return null;
        return { spoken, formula, visual, text_overlay };
      })
      .filter((h): h is Hook => h !== null);

    if (hooks.length === 0) continue;
    const full_script = typeof r.full_script === "string" ? r.full_script : "";
    if (!full_script) continue;
    const title = typeof r.title === "string" ? r.title : "";
    const description = typeof r.description === "string" ? r.description : "";
    const hashtags = Array.isArray(r.hashtags)
      ? r.hashtags.filter((h): h is string => typeof h === "string")
      : [];

    const payload: AnalyzerPayload = { hooks, full_script, title, description, hashtags, formatted: rawText, voiceover_script: buildVoiceoverScript({ hooks, full_script, title, description, hashtags, formatted: rawText }) };
    return payload;
  }

  return null;
}

export const Route = createFileRoute("/api/video-analyzer")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const { apiKey, baseUrl } = await readAiConfig(env, await currentUserId(request, context));
        const db = env?.DB;

        if (!apiKey || !baseUrl) {
          return Response.json(
            {
              error:
                "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured — add them in Settings → API Keys.",
            },
            { status: 500 },
          );
        }
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        let body: { input_type?: string; content?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const inputType = body.input_type;
        const content = body.content;

        if (inputType !== "transcript" && inputType !== "custom_idea") {
          return Response.json(
            { error: 'Missing or invalid "input_type" (must be "transcript" or "custom_idea")' },
            { status: 400 },
          );
        }
        if (typeof content !== "string" || !content.trim()) {
          return Response.json({ error: 'Missing "content"' }, { status: 400 });
        }

        const userPrompt =
          inputType === "transcript"
            ? buildTranscriptPrompt(content)
            : buildCustomIdeaPrompt(content);

        // --- Call Anthropic-compatible /messages endpoint ---
        // The full skill markdown is passed as the top-level `system` field
        // (standard Anthropic Messages API), which the Manifest proxy passes
        // through to the model.
        const anthropicUrl = anthropicMessagesUrl(String(baseUrl));
        const requestPayload = {
          model: "auto",
          max_tokens: 4096,
          system: VIRAL_HOOK_SCRIPT_WRITER_SKILL,
          messages: [{ role: "user", content: userPrompt }],
        };
        console.log(
          "[video-analyzer] POST",
          anthropicUrl,
          "input_type:",
          inputType,
          "system_chars:",
          VIRAL_HOOK_SCRIPT_WRITER_SKILL.length,
          "user_chars:",
          userPrompt.length,
        );

        let res: Response;
        try {
          res = await fetch(anthropicUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(requestPayload),
          });
        } catch (err: any) {
          console.log("[video-analyzer] fetch threw:", err?.message ?? String(err));
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        // Read body as text first so we always have the raw payload for debugging,
        // regardless of status or JSON validity.
        const rawBody = await res.text().catch(() => "");
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });
        console.log(
          "[video-analyzer] response status:",
          res.status,
          "headers:",
          JSON.stringify(responseHeaders),
          "body:",
          rawBody,
        );

        if (!res.ok) {
          return Response.json(
            {
              error: `Anthropic API error: ${res.status}`,
              detail: rawBody,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        let data: { content?: Array<{ type: string; text?: string }> } = {};
        try {
          data = JSON.parse(rawBody) as { content?: Array<{ type: string; text?: string }> };
        } catch (err: any) {
          return Response.json(
            {
              error: "Anthropic response was not valid JSON",
              detail: err?.message ?? String(err),
              rawBody,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        const text = (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();

        const payload = extractAnalyzerPayload(text);
        if (!payload) {
          return Response.json(
            {
              error: "Model returned no parseable script",
              raw: text,
              rawBody,
              parsed: data,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        // Preview/draft only — no D1 write. The client reviews, edits, and
        // separately finalizes via the existing library insert pattern.
        return Response.json({
          input_type: inputType,
          ...payload,
        });
      },
    },
  },
});
