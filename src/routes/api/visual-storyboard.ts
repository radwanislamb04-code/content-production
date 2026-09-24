import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { readAiConfig, anthropicMessagesUrl } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

// Skill text from .claude/skills/production-ready-storyboard-prompts.md; its prose
// OUTPUT FORMAT section is stripped there because the JSON-only override below wins.
import { PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL } from "../../lib/skills";

type ScriptRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type Character = {
  name: string;
  description: string;
};

type Shot = {
  shot_number: number;
  duration: string;
  script_portion: string;
  visual_description: string;
  camera_angle: string;
  transition: string;
  image_prompt: string;
  text_overlay: string;
  text_overlay_position: "top" | "center" | "bottom";
  voiceover: string;
};


export const Route = createFileRoute("/api/visual-storyboard")({
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

        let body: { script_id?: string; characters?: Array<{ name: string; description: string }> };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const scriptId = body.script_id;
        if (typeof scriptId !== "string" || !scriptId) {
          return Response.json({ error: 'Missing "script_id"' }, { status: 400 });
        }

        const characters: Character[] = Array.isArray(body.characters)
          ? body.characters.filter(
              (c): c is Character =>
                typeof c === "object" &&
                c !== null &&
                typeof (c as any).name === "string" &&
                typeof (c as any).description === "string",
            )
          : [];

        let scriptRow: ScriptRow | null = null;
        try {
          scriptRow = (await db
            .prepare("SELECT * FROM library WHERE id = ? AND type = ? AND user_id = ?")
            .bind(scriptId, "script",
              await currentUserId(request, context))
            .first()) as ScriptRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load script: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!scriptRow) {
          return Response.json({ error: "Script not found" }, { status: 404 });
        }

        // The description used to be parsed and then dropped — only names reached the
        // model, so every shot was written for "Enzo", a word it has never seen described.
        // The prompt now carries what the character actually looks like, and requires that
        // identity to be written into each shot's image_prompt (which is what gets pasted
        // into an image model, or handed to /api/generate-image with a reference photo).
        const characterRefs = characters.length
          ? [
              "CHARACTERS (keep them identical in every shot — face, hair, build, wardrobe, age):",
              ...characters.map((c) =>
                `- ${c.name}${c.description?.trim() ? `: ${c.description.trim()}` : " — no description on file, so describe them plainly and consistently across shots"}`,
              ),
              "Every shot's image_prompt must restate the character's full appearance inline (not just their name), so the prompt still describes the right person once it is copied somewhere else. Note wardrobe changes explicitly per shot; never change the face.",
            ].join("\n")
          : "No specific characters provided.";

        const scriptContentText = scriptRow.content ? (typeof scriptRow.content === "string" ? scriptRow.content : JSON.stringify(scriptRow.content)) : "";

        const jsonOverride = `IMPORTANT: Regardless of the OUTPUT FORMAT section above, you MUST respond with ONLY valid JSON in this exact structure: {\"shots\": [{\"shot_number\": int, \"duration\": string, \"script_portion\": string, \"visual_description\": string, \"camera_angle\": string, \"transition\": string, \"image_prompt\": string, \"text_overlay\": string, \"text_overlay_position\": \"top\"|\"center\"|\"bottom\", \"voiceover\": string}]}. Use the skill's quality standards (character consistency, cinematography vocabulary, pacing, safe zones, negative-prompt thinking folded into image_prompt) to inform the CONTENT of each field, but the output must be this JSON shape only — no markdown headers, no prose summary, no extra sections.`;

        const systemPrompt = PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL + `\n\n${characterRefs}\n\n${jsonOverride}`;

        // Which of the three hook options actually opens this script. Without saying so,
        // the storyboard model sees three hooks and may shoot the wrong one.
        let hookLine = "";
        try {
          const parsed = JSON.parse(scriptContentText) as Record<string, any>;
          const hooks = Array.isArray(parsed?.hooks) ? parsed.hooks : [];
          const index = Number.isInteger(parsed?.selected_hook_index) ? parsed.selected_hook_index : 0;
          const chosen = hooks[index];
          const spoken = typeof chosen === "string" ? chosen : chosen?.spoken;
          if (spoken) hookLine = `\nThe script opens with hook option ${index + 1} of ${hooks.length}: "${String(spoken).trim()}". Use that one as the opening shot; the other options were not chosen.`;
        } catch {
          /* no structured script — the body text still says what it says */
        }

        const userPrompt = `Script title: ${scriptRow.title}\nScript content:\n${scriptContentText}${hookLine}\n\nGenerate the storyboard shot list.`;

        const anthropicUrl = anthropicMessagesUrl(String(baseUrl));
        const requestPayload = {
          model: "auto",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };

        const maxAttempts = 3;
        const triedModels: string[] = [];
        let shots: Shot[] = [];
        let lastError: string | null = null;
        let lastRawBody: string = "";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          let res: Response;
          try {
            res = await fetch(anthropicUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
              },
              body: JSON.stringify(requestPayload),
            });
          } catch (err: any) {
            lastError = `Failed to reach Anthropic: ${err?.message ?? String(err)}`;
            continue;
          }

          if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            lastError = `Anthropic API error: ${res.status} - ${errorText}`;
            continue;
          }

          const data: { content?: Array<{ type: string; text?: string }>; model?: string } = await res.json();
          const rawBody = JSON.stringify(data);
          lastRawBody = rawBody;

          // Track which model was used (from response header or body)
          const modelUsed = res.headers.get("anthropic-model") ?? data.model ?? "unknown";
          triedModels.push(modelUsed);

          let extractedText = "";
          try {
            extractedText = (data.content ?? [])
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("\n")
              .trim();

            const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
            const candidates: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = fenceRegex.exec(extractedText)) !== null) {
              candidates.push(m[1]);
            }
            const firstOpen = extractedText.indexOf("{");
            const lastClose = extractedText.lastIndexOf("}");
            if (firstOpen !== -1 && lastClose > firstOpen) {
              candidates.push(extractedText.slice(firstOpen, lastClose + 1));
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
              if (Array.isArray(r.shots)) {
                const parsedShots = (r.shots as unknown[]).map((s): Shot | null => {
                  if (!s || typeof s !== "object") return null;
                  const sh = s as Record<string, unknown>;
                  return {
                    shot_number: typeof sh.shot_number === "number" ? sh.shot_number : 0,
                    duration: typeof sh.duration === "string" ? sh.duration : "",
                    script_portion: typeof sh.script_portion === "string" ? sh.script_portion : "",
                    visual_description: typeof sh.visual_description === "string" ? sh.visual_description : "",
                    camera_angle: typeof sh.camera_angle === "string" ? sh.camera_angle : "",
                    transition: typeof sh.transition === "string" ? sh.transition : "",
                    image_prompt: typeof sh.image_prompt === "string" ? sh.image_prompt : "",
                    text_overlay: typeof sh.text_overlay === "string" ? sh.text_overlay : "",
                    text_overlay_position:
                      sh.text_overlay_position === "top" || sh.text_overlay_position === "center" || sh.text_overlay_position === "bottom"
                        ? sh.text_overlay_position
                        : "center",
                    voiceover: typeof sh.voiceover === "string" ? sh.voiceover : "",
                  };
                }).filter((s): s is Shot => s !== null && s.shot_number !== 0);
                if (parsedShots.length > 0) {
                  shots = parsedShots;
                  break;
                }
              }
            }
          } catch (parseErr: any) {
            console.error(`JSON parse error on attempt ${attempt}:`, parseErr);
            lastError = parseErr?.message ?? String(parseErr);
            continue;
          }

          if (shots.length > 0) {
            break; // Success
          } else {
            lastError = "Failed to parse storyboard shots from model response (no valid shots array)";
          }
        }

        if (shots.length === 0) {
          return Response.json(
            {
              error: "Failed to parse storyboard shots from model response after 3 attempts",
              message: lastError,
              triedModels,
              raw: lastRawBody,
            },
            { status: 502 },
          );
        }

        const now = Date.now();
        const storyboardId = crypto.randomUUID();
        const storyboardTitle = scriptRow.title ? `Storyboard: ${scriptRow.title}` : "Storyboard";
        const storyboardContent = JSON.stringify({ shots });

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, content_pillar, title, content, source_id, created_at, updated_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              storyboardId,
              "storyboard",
              "draft",
              scriptRow.content_pillar ?? null,
              storyboardTitle,
              storyboardContent,
              scriptId,
              now,
              now,
            await currentUserId(request, context),
              )
            .run();
        } catch (err: any) {
          console.error("D1 insert error after streaming:", err);
          return Response.json(
            {
              error: `Failed to persist storyboard: ${err?.message ?? String(err)}`,
              message: err?.message ?? String(err),
              raw: lastRawBody,
            },
            { status: 500 },
          );
        }

        return Response.json({
          storyboard_id: storyboardId,
          script_id: scriptId,
          shot_count: shots.length,
          shots,
        });
      },
    },
  },
});
