import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { readAiConfig, anthropicMessagesUrl } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

// The skill text comes from .claude/skills/viral-hook-script-writer.md at build time —
// edit the markdown, not a copy of it (see src/lib/skills.ts). Whether this account may
// receive it at all is decided per user by `skillForAccount`: the file is written for one
// niche and built from the owner's competitor research, so another account gets the
// generic script shape plus its own Creator profile instead.
import { GENERIC_SCRIPT_SYSTEM_PROMPT, skillForAccount } from "../../lib/skills";
import { creatorProfileBlock, readCreatorProfile, type CreatorProfile } from "../../lib/settings";
import { isThinBody, MIN_SCRIPT_BEATS, selectHook, type ScriptContent } from "../../lib/script-body";

type IdeaRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type Hook = {
  spoken: string;
  formula: string;
  visual: string;
  text_overlay: string;
};

type ScriptPayload = ScriptContent & {
  hooks: Hook[];
  body: string;
  cta: string;
};


function buildUserPrompt(
  title: string,
  ideaContext: string,
  opts: { skillAttached: boolean; profile: CreatorProfile },
): string {
  const opener = opts.skillAttached
    ? `Write a viral short-form video script for the following content idea. Apply the full "Viral Hook & Script Writer" system from your system instructions.`
    : `Write a short-form video script for the following content idea, for the creator described below. Follow the script structure in your system instructions.`;
  return `${opener}

${creatorProfileBlock(opts.profile)}

IDEA TITLE:
${title}

IDEA CONTEXT:
${ideaContext}

Deliver your response in TWO parts, in this order:

PART 1 — Produce the complete script using the skill's exact "STEP 5 — Output Format" structure (the block that begins with "🎬 TITLE/IDEA:"). Include every field: MODE, TARGET VIEWER, PAYOFF, LENGTH, the 3 HOOK OPTIONS (each with spoken line + formula + Visual + Text overlay), FULL SCRIPT with timestamped beats, CAPTION, COMMENT BAIT, and FIRST-FRAME NOTE.

PART 2 — After PART 1, on a new line, output a single JSON code block (fenced with \`\`\`json) containing a simplified version of the same script with this EXACT shape:

\`\`\`json
{
  "hooks": [
    { "spoken": "spoken line 1", "formula": "hook formula name", "visual": "visual note", "text_overlay": "on-screen text" },
    { "spoken": "spoken line 2", "formula": "...", "visual": "...", "text_overlay": "..." },
    { "spoken": "spoken line 3", "formula": "...", "visual": "...", "text_overlay": "..." }
  ],
  "body": "the COMPLETE script, one beat per line, each line starting with its timestamp and label, e.g. [0-3s] HOOK: ... then the setup, delivery and re-hook beats, and a final [..] CTA: ... beat. At least four lines. Never just the hook line.",
  "cta": "the final call-to-action line"
}
\`\`\`

The JSON must contain exactly 3 hook objects, be valid and parseable, and match the shape above exactly.`;
}

function extractScript(rawText: string): ScriptPayload | null {
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
    const body = typeof r.body === "string" ? r.body : "";
    const cta = typeof r.cta === "string" ? r.cta : "";
    if (!body) continue;

    // The voiceover is built by `selectHook` at the end, from the hook that ends up in
    // the body — not here, where no hook has been chosen yet.
    return { hooks, body, cta, formatted: rawText };
  }

  return null;
}

export const Route = createFileRoute("/api/hook-script-writer")({
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

        let body: { idea_id?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const ideaId = body.idea_id;
        if (typeof ideaId !== "string" || !ideaId) {
          return Response.json({ error: 'Missing "idea_id"' }, { status: 400 });
        }

        // --- Fetch idea from library ---
        let idea: IdeaRow | null = null;
        try {
          idea = (await db
            .prepare("SELECT * FROM library WHERE id = ? AND user_id = ?")
            .bind(ideaId,
              await currentUserId(request, context))
            .first()) as IdeaRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load idea: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!idea) {
          return Response.json({ error: "Idea not found" }, { status: 404 });
        }

        const uid = await currentUserId(request, context);
        const profile = await readCreatorProfile(env, uid);
        const skill = await skillForAccount(env, uid, "hook_script", profile);
        const userPrompt = buildUserPrompt(idea.title, idea.content ?? "", {
          skillAttached: skill.applies,
          profile,
        });

        // --- Call Anthropic-compatible /messages endpoint ---
        // The full skill markdown is passed as the top-level `system` field
        // (standard Anthropic Messages API), which the Manifest proxy passes
        // through to the model. When the skill does not apply to this account, the
        // generic script shape takes its place and the niche comes from the profile.
        const systemPrompt = skill.text ?? GENERIC_SCRIPT_SYSTEM_PROMPT;
        const anthropicUrl = anthropicMessagesUrl(String(baseUrl));
        const requestPayload = {
          model: "auto",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };
        console.log(
          "[hook-script-writer] POST",
          anthropicUrl,
          "skill:",
          skill.reason,
          "system_chars:",
          systemPrompt.length,
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
          console.log("[hook-script-writer] fetch threw:", err?.message ?? String(err));
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
          "[hook-script-writer] response status:",
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

        let parsedScript = extractScript(text);

        // A body of one line is not a script: the voiceover is built from it and the
        // storyboard shoots it, so a thin body quietly breaks everything downstream.
        // One retry, asked plainly — the model sometimes answers the shape question with
        // a summary instead of the beats.
        if (parsedScript && isThinBody(String(parsedScript.body ?? ""))) {
          console.log(
            "[hook-script-writer] thin body (%d beats) — retrying once",
            String(parsedScript.body ?? "").split("\n").filter((l) => l.trim()).length,
          );
          try {
            const retryRes = await fetch(anthropicUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                ...requestPayload,
                messages: [{
                  role: "user",
                  content: `${userPrompt}\n\nIMPORTANT: your previous answer's \"body\" was too short to shoot. Return the COMPLETE script: at least ${MIN_SCRIPT_BEATS} lines in \"body\", one beat per line, each starting with its timestamp and label, ending with the CTA beat.`,
                }],
              }),
            });
            if (retryRes.ok) {
              const retryText = (await retryRes.json()) as { content?: Array<{ type: string; text?: string }> };
              const retryRaw = (retryText.content ?? [])
                .filter((b) => b.type === "text")
                .map((b) => b.text ?? "")
                .join("\n")
                .trim();
              const retryScript = extractScript(retryRaw);
              if (retryScript && !isThinBody(String(retryScript.body ?? ""))) {
                parsedScript = retryScript;
                console.log("[hook-script-writer] retry produced a full body");
              } else {
                console.log("[hook-script-writer] retry was thin too — keeping the first answer");
              }
            }
          } catch (err: any) {
            console.log("[hook-script-writer] retry failed:", err?.message ?? String(err));
          }
        }
        // Hook 1 opens the script by default, so a freshly generated script is already
        // complete and internally consistent — and the owner can move the choice later
        // without regenerating (POST /api/script-select-hook).
        const script = parsedScript ? selectHook(parsedScript, 0) : null;
        if (!script) {
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

        // --- Persist to D1 library table as a new script row ---
        // Store the full structured script (hooks + body + cta + formatted STEP 5
        // output) as JSON in `content`. type/status/content_pillar preserved.
        const now = Date.now();
        const scriptId = crypto.randomUUID();
        const scriptTitle = `Script: ${idea.title}`;
        const scriptContent = JSON.stringify(script);
        const contentPillar = idea.content_pillar ?? null;

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, content_pillar, title, content, source_id, created_at, updated_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 content = excluded.content,
                 status = excluded.status,
                 content_pillar = excluded.content_pillar,
                 source_id = excluded.source_id,
                 updated_at = excluded.updated_at`,
            )
            .bind(scriptId, "script", "draft", contentPillar, scriptTitle, scriptContent, ideaId, now, now,
              await currentUserId(request, context))
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to persist script: ${err?.message ?? String(err)}`, script },
            { status: 500 },
          );
        }

        return Response.json({
          id: scriptId,
          type: "script",
          status: "draft",
          content_pillar: contentPillar,
          title: scriptTitle,
          idea_id: idea.id,
          script,
          // Which playbook wrote this: the niche-bound skill, or the generic script
          // shape. Reported rather than implied, so it can be checked from outside.
          skill: { applied: skill.applies, reason: skill.reason, niche: skill.niche },
          created_at: now,
          updated_at: now,
        });
      },
    },
  },
});
