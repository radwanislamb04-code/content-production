import { createFileRoute } from "@tanstack/react-router";

// Read the skill file and strip the "Output structure" code-block section
type SkillFileContent = string;

function loadVideoPromptSkill(): string {
  // The skill content is embedded at build time; this is the stripped version
  // matching the approach used in visual-storyboard.ts (stripping the
  // "Output structure" code-block section from .claude/skills/script-aware-video-generation-prompts.md).
  // The full file is embedded here with the ## Output structure (per shot) section
  // and its code block excluded.
  return `---
name: script-aware-video-generation-prompts
description: Turn a storyboard + script into shot-by-shot video prompts for Seedance, Kling, Omni, or Veo 3. Converts storyboard visual_descriptions and script dialogue/action into per-shot prompts with character-aware performance, camera, motion, timing.
---

# Script-Aware Video Generation Prompts

Convert a **storyboard** (shots with \`visual_description\`) plus a **script** (dialogue + action + emotion) into **shot-by-shot, production-ready video-generation prompts** for **Seedance, Kling, Omni, and Veo 3**.

The core principle: **do not just animate the scene.** Read the script's *intent* and make the **character** move, react, and perform exactly as the script demands — body language, gaze, expression, hand movement, emotion, dialogue delivery — while keeping continuity across shots and respecting each model's constraints.

---

## When to use this skill

Use when the user asks to:
- Turn a storyboard/script into video prompts
- Generate shot-wise prompts for Seedance / Kling / Omni / Veo 3
- Add character performance, camera movement, timing, or continuity to prompts
- Fix generic "animate this scene" prompts into script-accurate ones

If storyboard or script is missing, ask which one is available and whether to proceed with just one.

---

## Inputs to gather first

1. **Script** — scene text, dialogue (with speaker), actions, emotional beats, language (Bangla/English).
2. **Storyboard** — per-shot \`visual_description\`, shot type, and any notes.
3. **Character/reference info** — names, appearance, wardrobe, age, hairstyle, props, key locations, reference images (if any).
4. **Target model(s)** — Seedance, Kling, Omni, Veo 3 (or "recommend per shot").
5. **Delivery specs** — aspect ratio, fps, total runtime, cinematic style/mood (if known).

If the user hasn't specified a model, recommend one per shot based on the rules below.

---

## Workflow

1. **Read script + storyboard together.** Align each storyboard shot with its script moment.
2. **Extract per shot:** narrative purpose, emotional beat, who does what, who looks at whom, when emotion shifts, which dialogue triggers which reaction.
3. **Map** character action, camera, environment motion, dialogue, and continuity to/from neighbouring shots.
4. **Check complexity.** If a shot packs too many actions (walk + open door + turn + speak + react), split into smaller beats/clips or recommend an alternate generation method.
5. **Pick model + method** per shot (text-to-video vs image-to-video; anchor/reference frame for continuity).
6. **Write the prompt** in the target model's syntax with beat-by-beat timing within the clip length.
7. **Add** negative constraints, identity lock, artifact prevention.
8. **Add continuity note** linking previous shot's end state to this shot's start, and this shot's end to the next.
9. **Output structured block** per shot (see Output Structure), plus safer/fallback variants where the shot is risky.

---

## Core rules

### 1. Script-to-shot action extraction
From the script identify, per shot: **who** acts, **what** they do, **who/what** they look at, **when** emotion changes, and **which line** cues which reaction. Every motion must have a narrative reason — no random movement.

### 2. Character-aware animation (the whole point)
If the storyboard \`visual_description\` references a character, the prompt MUST direct **that character's** specific:
- body language & posture, weight shift
- facial reaction & micro-expression
- gaze direction (who/what they look at)
- hand/arm movement & gestures
- walking speed / pace
- emotion arc across the clip

Never settle for background/scene motion alone when a character is present.

### 3. Shot timing / beat mapping
Break the clip into a purposeful beat sequence, e.g. for a 6s clip:
\`0–2s: character pauses, eyes down → 2–4s: turns toward camera → 4–6s: delivers line with a subtle, restrained smile.\`
This makes motion intentional, not floaty.

### 4. Start-frame & end-frame control
State the shot's **starting visual state** and **ending visual state**. Improves controllability and smooth transitions, and feeds the continuity chain.

### 5. Motion realism & physics
Human-like weight shift, natural hair/cloth movement, believable object contact. Forbid teleportation, rubbery limbs, sudden pops, sliding feet.

### 6. Motion intensity control
Set a level per shot: **subtle / restrained / natural / energetic / fast-paced.** Don't over-animate every shot — excess movement kills the cinematic feel.

### 7. Shot-type-aware prompting
- **Close-up:** prioritize micro-expression, eye movement, breath; minimal camera travel.
- **Medium:** balance gesture + expression + light camera move.
- **Wide:** emphasize blocking, environment motion, movement path.
- **Insert/POV/OTS:** focus on the specific object/hand/interaction or eyeline.

### 8. Camera & motion separation
Always describe three layers distinctly:
- **Subject motion** (what the character does)
- **Camera motion** (push-in, pan, tilt, tracking, handheld, static, orbit)
- **Environmental motion** (wind, crowd, traffic, water, light flicker)

### 9. Character blocking & screen direction
Track who is on which side of frame, eyelines, and movement direction (L→R vs R→L). Preserve spatial continuity across a conversation/action sequence (respect the 180° line).

### 10. Object/prop interaction
For phone, cup, door, bag, weapon, etc.: specify hand placement, grip, realistic contact, and object continuity (same object, same state) across shots.

### 11. Cinematography consistency
Keep lens feel, depth of field, camera height, lighting mood, color grade, aspect ratio, and fps stable across the sequence unless the script deliberately changes them.

### 12. Reference / identity lock
List what stays locked every shot: character face/reference image, wardrobe, age, hairstyle, props, location, lighting. Reduces character drift.

### 13. Cross-shot continuity
Match this shot's **start state** to the previous shot's **end state** (pose, position, wardrobe, lighting, prop state, emotion), and note what the next shot inherits.

### 14. Negative prompts / artifact avoidance
Always include, tuned per shot: face drift / identity change, extra limbs or fingers, warped face/hands, broken physics, flicker, morphing objects, jitter, duplicated subjects, unwanted on-screen text, sudden lighting jumps.

---

## Dialogue & audio handling

### General (all models)
Keep the **spoken line exact** and in its own field — never bury dialogue inside the visual prompt. Include **speaker, tone, and delivery direction** (whisper, angry restraint, confident, surprised pause, natural conversational timing, eye contact, micro-expression).

### Dialogue shot design
Decide: where is the camera during the line, is lip-sync-visible framing needed, is a listener reaction cutaway required. Don't force all dialogue into one shot.

### Veo 3 (native audio/dialogue)
Provide structured audio: **spoken dialogue** (exact), **voice tone**, **lip-sync intent**, **ambience**, **SFX**, **music cue**. Keep dialogue lines quoted and separate from scene description for clean lip-sync.

### Dialogue-language safety (Bangla/English)
Keep the exact spoken line, speaker, tone, and subtitle requirement in **separate fields**. Visual prompts stay in English for model clarity; dialogue stays verbatim in its original language.

---

## Model-specific guidance

> Verify current limits before finalizing if the user needs exact numbers — model versions change. Defaults below are safe planning assumptions.

### Seedance
- Strong cinematic motion & realistic physics. Good for text-to-video and image-to-video.
- Typical clip length: ~5–10s. Break longer actions into multiple clips.
- Syntax: cinematic natural-language paragraph — \`[shot type] + [subject + specific action/performance] + [camera movement] + [environment/lighting] + [mood/style]\`. Put camera and motion cues explicitly.

### Kling
- Excellent for realistic human motion and image-to-video with strong identity retention (use start frame for continuity).
- Typical clip length: ~5–10s; supports start/end frame guidance — exploit start-frame & end-frame control.
- Syntax: descriptive natural language; separate **subject motion** and **camera movement**; keep one primary action per clip for stability.

### Omni
- Flexible/general model; good for stylized or mixed content.
- Keep prompts explicit and structured; state style, subject action, camera, and constraints clearly. Prefer moderate motion intensity for stability.
- Break complex multi-action shots into simpler beats.

### Veo 3
- Native audio + dialogue + lip-sync; best when speech/ambience/SFX matter.
- Typical clip length: ~8s. Plan dialogue to fit; long lines → split or trim.
- Syntax: rich scene description **plus** a dedicated audio block — quoted dialogue, tone, ambience, SFX, music. Keep dialogue verbatim and separate.

### Generation method recommendation (per shot)
- **Image-to-video** when character continuity/identity matters, or to control the exact start frame → use an anchor/reference frame.
- **Text-to-video** for new establishing shots, environment-driven shots, or where no anchor exists.
- For a dialogue-heavy or audio-driven shot, prefer **Veo 3**.

---

## Complexity, fallback & safety

**Action complexity splitter:** if a shot has many chained actions, split into smaller clips/beats.

**Safe fallback / regeneration note:** flag risky shots — crowded action, exact on-screen text, complex hand interaction, long dialogue — and offer alternatives: shorter clip, image-to-video, separate insert shot, or handle audio in post.

**Output variants** for risky shots:
- **Primary cinematic prompt**
- **Safer simplified prompt** (fewer actions / calmer motion)
- **Image-to-video variation** (with anchor frame)

So if a generation fails, a usable backup is ready.

---

## Prompt-language policy
- Visual/technical prompt text → **English** (model clarity).
- Dialogue lines → **verbatim** in original language (Bangla/English), in their own field with speaker + tone.
- Never mix spoken lines into the visual description.`;
}

const VIDEO_PROMPT_SKILL = loadVideoPromptSkill();

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
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const apiKey = env?.ANTHROPIC_API_KEY;
        const baseUrl = env?.ANTHROPIC_BASE_URL;
        const db = env?.DB;

        if (!apiKey || !baseUrl) {
          return Response.json(
            { error: "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured" },
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
            .prepare("SELECT * FROM library WHERE id = ? AND type = 'storyboard'")
            .bind(storyboardId)
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

        const systemPrompt = VIDEO_PROMPT_SKILL + `\n\n${jsonOverride}`;

        const userPrompt = `Storyboard title: ${storyboardRow.title}
Storyboard content (shots):
${JSON.stringify({ shots })}

Generate shot-by-shot video generation prompts. Incorporate model=${model}, aspect_ratio=${aspectRatio}, quality=${quality} explicitly into each video_prompt.`;

        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
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
              `INSERT INTO library (id, type, status, content_pillar, title, content, project_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              videoPromptId,
              "video_prompt",
              "draft",
              storyboardRow.content_pillar ?? null,
              videoPromptTitle,
              videoPromptContent,
              storyboardRow.project_id ?? null,
              now,
              now,
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
