import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { readAiConfig, anthropicMessagesUrl } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

// Skill text from .claude/skills/script-aware-video-generation-prompts.md, minus its
// "Output structure (per shot)" section — the JSON-only override below wins instead.
import { SCRIPT_AWARE_VIDEO_GENERATION_PROMPTS_SKILL as VIDEO_PROMPT_SKILL } from "../../lib/skills";


type StoryboardRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  project_id: string | null;
  created_at: number;
  updated_at: number;
};

type Shot = {
  shot_number: number;
  duration: string;
  script_portion: string;
  visual_description: string;
  camera_angle: string;
  transition: string;
  image_prompt?: string;
  text_overlay?: string;
  voiceover?: string;
};

type VideoPromptItem = {
  shot_number: number;
  duration: string;
  video_prompt: string;
  negative_prompt: string;
  camera_motion: string;
};

export const Route = createFileRoute("/api/video-gen-prompt")({
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

        let body: {
          storyboard_id?: string;
          model?: "seedance" | "omni" | "veo3";
          aspect_ratio?: "9:16" | "16:9" | "1:1";
          quality?: string;
        } = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const storyboardId = body.storyboard_id;
        const model = body.model;
        const aspectRatio = body.aspect_ratio;
        const quality = body.quality;

        if (typeof storyboardId !== "string" || !storyboardId) {
          return Response.json({ error: 'Missing "storyboard_id"' }, { status: 400 });
        }
        if (typeof model !== "string" || (model !== "seedance" && model !== "omni" && model !== "veo3")) {
          return Response.json({ error: 'Invalid or missing "model" (must be seedance, omni, or veo3)' }, { status: 400 });
        }
        if (typeof aspectRatio !== "string" || (aspectRatio !== "9:16" && aspectRatio !== "16:9" && aspectRatio !== "1:1")) {
          return Response.json({ error: 'Invalid or missing "aspect_ratio" (must be 9:16, 16:9, or 1:1)' }, { status: 400 });
        }
        if (typeof quality !== "string" || !quality) {
          return Response.json({ error: 'Missing "quality"' }, { status: 400 });
        }

        // --- Fetch storyboard from D1 ---
        let storyboardRow: StoryboardRow | null = null;
        try {
          storyboardRow = (await db
            .prepare("SELECT * FROM library WHERE id = ? AND type = 'storyboard' AND user_id = ?")
            .bind(storyboardId,
              await currentUserId(request, context))
            .first()) as StoryboardRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load storyboard: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!storyboardRow) {
          return Response.json({ error: "Storyboard not found" }, { status: 404 });
        }

        // Parse content as JSON to get shots array
        let shots: Shot[] = [];
        try {
          const parsedContent = storyboardRow.content ? JSON.parse(storyboardRow.content) : null;
          if (parsedContent && Array.isArray(parsedContent.shots)) {
            shots = parsedContent.shots as Shot[];
          }
        } catch (err: any) {
          return Response.json(
            { error: `Failed to parse storyboard content: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        // Build system prompt from embedded skill, strip output structure,
        // and append JSON-only override instruction
        const jsonOverride = `IMPORTANT: You MUST respond with ONLY valid JSON in this exact structure: {"prompts": [{"shot_number": int, "duration": string, "video_prompt": string, "negative_prompt": string, "camera_motion": string}]}. No markdown headers, no prose, no extra sections. The video_prompt for each shot must explicitly mention the target model ("${model}"), the aspect ratio ("${aspectRatio}"), and the quality level ("${quality}"). Tailor prompt syntax and style to the target model per the skill's model-specific guidance. camera_motion is decided by you for each shot based on cinematic direction vocabulary (e.g., "slow pan left", "static", "dolly in", "tilt up"). Include a negative_prompt with standard exclusions tuned per shot.`;

        // Video-model prompts are English by convention — those models are trained on
        // English direction vocabulary ("slow pan left", "dolly in"). Say so rather than
        // leaving it to luck.
        const systemPrompt =
          VIDEO_PROMPT_SKILL +
          `\n\nLANGUAGE: write every field in English, whatever language the storyboard's own text is in.\n\n${jsonOverride}`;

        const userPrompt = `Storyboard title: ${storyboardRow.title}
Storyboard content (shots):
${JSON.stringify({ shots })}

Generate shot-by-shot video generation prompts. Incorporate model=${model}, aspect_ratio=${aspectRatio}, quality=${quality} explicitly into each video_prompt.`;

        const anthropicUrl = anthropicMessagesUrl(String(baseUrl));
        const requestPayload = {
          model: "auto",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };

        const maxAttempts = 3;
        const triedModels: string[] = [];
        let prompts: VideoPromptItem[] = [];
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

          const rawBody = await res.text();
          lastRawBody = rawBody;

          let data: { content?: Array<{ type: string; text?: string }>; model?: string } = {};
          try {
            data = JSON.parse(rawBody) as { content?: Array<{ type: string; text?: string }>; model?: string };
          } catch (err: any) {
            lastError = `Invalid JSON response: ${err?.message ?? String(err)}`;
            continue;
          }

          const modelUsed = res.headers.get("anthropic-model") ?? data.model ?? "unknown";
          triedModels.push(modelUsed);

          let extractedText = "";
          try {
            extractedText = (data.content ?? [])
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("\n")
              .trim();
          } catch {
            // ignore
          }

          try {
            // Fenced-JSON scan for the prompts array
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
              if (Array.isArray(r.prompts)) {
                const parsedPrompts = (r.prompts as unknown[]).map((p): VideoPromptItem | null => {
                  if (!p || typeof p !== "object") return null;
                  const item = p as Record<string, unknown>;
                  return {
                    shot_number: typeof item.shot_number === "number" ? item.shot_number : 0,
                    duration: typeof item.duration === "string" ? item.duration : "",
                    video_prompt: typeof item.video_prompt === "string" ? item.video_prompt : "",
                    negative_prompt: typeof item.negative_prompt === "string" ? item.negative_prompt : "",
                    camera_motion: typeof item.camera_motion === "string" ? item.camera_motion : "",
                  };
                }).filter((p): p is VideoPromptItem => p !== null && p.shot_number !== 0);
                if (parsedPrompts.length > 0) {
                  prompts = parsedPrompts;
                  break;
                }
              }
            }
          } catch (parseErr: any) {
            lastError = parseErr?.message ?? String(parseErr);
            continue;
          }

          if (prompts.length > 0) {
            break; // Success
          } else {
            lastError = "Failed to parse video prompts from model response (no valid prompts array)";
          }
        }

        if (prompts.length === 0) {
          return Response.json(
            {
              error: "Failed to generate video prompts after 3 attempts",
              message: lastError,
              tried_models: triedModels,
              raw: lastRawBody,
            },
            { status: 500 },
          );
        }

        // --- Insert into D1 ---
        const now = Date.now();
        const videoPromptId = crypto.randomUUID();
        const videoPromptTitle = storyboardRow.title ? storyboardRow.title : "Video Prompt";
        const videoPromptContent = JSON.stringify({ model, aspect_ratio: aspectRatio, quality, prompts });

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, content_pillar, title, content, source_id, project_id, created_at, updated_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              videoPromptId,
              "video_prompt",
              "draft",
              storyboardRow.content_pillar ?? null,
              videoPromptTitle,
              videoPromptContent,
              storyboardId,
              storyboardRow.project_id ?? null,
              now,
              now,
            await currentUserId(request, context),
              )
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to persist video prompt: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        return Response.json({
          video_prompt_id: videoPromptId,
          storyboard_id: storyboardId,
          model,
          aspect_ratio: aspectRatio,
          quality,
          prompts,
        });
      },
    },
  },
});
