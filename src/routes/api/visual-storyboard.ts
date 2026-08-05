import { createFileRoute } from "@tanstack/react-router";

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

// Full contents of .claude/skills/production-ready-storyboard-prompts.md embedded verbatim
// as a system-level instruction. Keep in sync with the skill file.
const PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL = `---
name: production-ready-storyboard-prompts
description: Generate copy-paste-ready storyboard prompts for AI image/video models. Use when user needs storyboard shots, scene prompts, or visual production plans. Supports ChatGPT Image, Nano Banana Pro, Runway, Kling, Sora, Pika.
---

# Production-Ready Storyboard Prompts

Generate international-standard, copy-paste-ready storyboard prompts for AI image and video generation models.

---

## WHEN TO USE

- User asks for a storyboard, shot list, scene breakdown, or visual production plan
- User wants prompts for AI image or video generation (ChatGPT Image, Nano Banana Pro, Runway, Kling, Sora, Pika, etc.)
- User is producing social content, ads, short films, reels, or explainer videos
- User wants to convert a script or concept into visual shots

---

## OUTPUT FORMAT

For each storyboard shot, output a structured block:

\`\`\`
### Shot [number] — [brief label]

**Scene description:** [1-2 sentence narrative context]

**Image prompt:**
[Full detailed prompt ready to paste into the target model]

**Negative prompt:** [if applicable]

**Video/animation prompt:** [if video generation is needed]

**Motion direction:** [camera and subject movement for video models]

**Duration:** [suggested seconds]

**Aspect ratio:** [e.g., 16:9, 9:16, 1:1]

**Text overlay:** [any on-screen text, positioned to avoid safe zone conflicts]

**Audio/SFX cue:** [background music mood, sound effects]

**Transition to next:** [cut / dissolve / zoom / match cut / etc.]
\`\`\`

Omit fields that are not relevant to the specific project (e.g., skip video fields for image-only storyboards).

---

## CORE PRINCIPLES

### 1. Model-Specific Prompt Syntax

Adapt prompt structure to the target model:

**ChatGPT Image (DALL·E / GPT-4o image):**
- Use natural, descriptive English sentences
- Front-load the most important visual elements
- Include style references explicitly ("cinematic film still", "professional photography", "3D render")
- Specify lighting, camera, and mood in the same sentence flow
- Use negative constraints in a separate instruction if needed

**Nano Banana Pro / Flux-based models:**
- Use comma-separated tag-style prompts
- Weight important elements with emphasis markers if supported
- Keep prompts dense but ordered: subject → action → environment → style → lighting → camera
- Use negative prompt field for exclusions

**Video models (Runway Gen-3, Kling, Sora, Pika, Luma):**
- Start with the key subject and action
- Describe motion explicitly: "camera slowly dollies in", "subject walks left to right"
- Specify start frame and end frame states when supported
- Keep prompts concise (video models respond better to focused prompts)
- Include temporal cues: "over 4 seconds", "gradually", "suddenly"

Always ask the user which model(s) they are targeting. If not specified, default to ChatGPT Image format with a video prompt variant included.

### 2. Character Consistency Across Shots

This is critical for professional output. For every recurring character:

- **Define once, reference always:** Create a character sheet at the top of the storyboard:
  \`\`\`
  **Character: [Name]**
  Age: [specific], Gender: [specific]
  Ethnicity/skin tone: [specific description]
  Hair: [color, length, style]
  Eyes: [color, shape]
  Build: [body type]
  Outfit: [exact clothing with colors and details]
  Distinguishing features: [scars, glasses, accessories, tattoos]
  Expression baseline: [default demeanor]
  \`\`\`

- **Embed character details in every shot prompt** — do not assume the model remembers. Repeat key identifiers (hair color, outfit, distinguishing features) in each prompt.

- **Use anchoring phrases:** "the same [character description] from previous shots" (works in some models for consistency)

- **For video models:** Use reference frame/image uploads when supported (Runway, Kling). Note this in the shot instructions.

### 3. Cinematic Direction Vocabulary

Use precise, industry-standard terms:

**Shot types:** extreme wide shot (EWS), wide shot (WS), full shot (FS), medium shot (MS), medium close-up (MCU), close-up (CU), extreme close-up (ECU), over-the-shoulder (OTS), point-of-view (POV), two-shot, insert shot, cutaway, establishing shot

**Camera angles:** eye level, low angle, high angle, bird's eye, dutch angle/tilt, worm's eye

**Camera movement:** static, pan (left/right), tilt (up/down), dolly in/out, truck left/right, crane up/down, handheld/shaky, steadicam, zoom in/out, rack focus, whip pan, orbit/arc shot

**Lens feel:** wide-angle (distortion, expansive), telephoto (compression, isolation), macro (extreme detail), shallow depth of field (bokeh), deep focus

**Lighting:** golden hour, blue hour, harsh midday sun, soft diffused, Rembrandt lighting, split lighting, rim/backlight, silhouette, neon/practical lights, chiaroscuro, low-key, high-key, motivated lighting

**Composition:** rule of thirds, centered symmetry, leading lines, frame within frame, negative space, foreground interest, depth layering

### 4. Aspect Ratio & Text-Overlay Safe Zones

**Aspect ratios by platform:**
- YouTube / horizontal video: 16:9 (1920×1080)
- Instagram Reels / TikTok / Shorts: 9:16 (1080×1920)
- Instagram feed / square: 1:1 (1080×1080)
- Instagram post: 4:5 (1080×1350)
- Cinematic: 2.39:1 or 21:9
- Thumbnail: 16:9 (1280×720)

**Safe zone rules:**
- Keep critical visual elements away from edges (minimum 10% margin on all sides)
- **Top 15-20%:** Reserve for platform UI elements (profile icons, follow buttons)
- **Bottom 15-20%:** Reserve for captions, descriptions, CTA buttons
- **Center 60-70%:** Primary action zone — place key subjects here
- When text overlay is planned, explicitly compose the shot with clean/uncluttered area where text will go
- Specify text placement in the prompt: "with clear sky area in the upper third for text overlay"

### 5. Shot-Count Pacing

Match shot count to content duration and narrative rhythm:

| Content type | Duration | Recommended shots | Avg seconds/shot |
|---|---|---|---|
| Instagram Reel / TikTok | 15-30s | 5-8 shots | 2-4s |
| Short Reel | 30-60s | 8-15 shots | 3-5s |
| YouTube Short | 60s | 10-15 shots | 4-6s |
| Explainer / Ad | 30-90s | 8-20 shots | 4-6s |
| YouTube video intro | 15-30s | 4-8 shots | 3-5s |
| Short film scene | 2-5 min | 15-40 shots | 5-10s |

**Pacing rules:**
- **Hook (first 1-3s):** High-impact, visually striking opening shot — bold color, action, or surprise
- **Rising action:** Gradually increase shot frequency for tension
- **Climax:** Fastest cuts or a single dramatic hold
- **Resolution:** Slower pacing, wider shots, breathing room
- **CTA/End:** Clean, simple, brand-focused final shot
- Vary shot types within a sequence (don't repeat 3 medium shots in a row)
- Alternate between movement and stillness

### 6. Text-in-Image vs Text Overlay Field

**Text burned into the image (text-in-image):**
- Use for: stylized titles, logos, artistic typography, text that is part of the scene (signs, books, screens)
- In the prompt, specify: exact text in quotes, font style, color, size, placement
- Example: \`with bold white sans-serif text "LEVEL UP" centered in the upper third\`
- ⚠️ AI models often struggle with text accuracy — keep text short (1-4 words), use simple fonts, and plan for post-production touch-up

**Text overlay (separate field, added in post):**
- Use for: subtitles, captions, CTAs, dynamic text, multi-language text, precise typography
- Specify in the \`text_overlay\` field, not in the image prompt
- Include: exact text, font suggestion, color, size, position, animation (fade in, typewriter, bounce)
- This gives the user full control in their editing software

**Decision rule:** If the text must be pixel-perfect or will change across versions → text overlay. If the text is part of the visual aesthetic → text-in-image.

### 7. Video/Animation Enhancement

When storyboard shots are intended for video generation or animation:

**Motion direction per shot:**
- Describe subject motion: "character walks toward camera", "hand reaches into frame from left"
- Describe camera motion: "slow dolly in from medium to close-up"
- Describe environmental motion: "leaves falling in background", "clouds moving right to left"
- Specify speed: "slow", "normal", "fast", "accelerating"

**Transition planning:**
- Plan visual continuity between shots (end state of shot N → start state of shot N+1)
- Specify transition type: hard cut, dissolve, fade to black, zoom transition, match cut, whip pan, morph
- For match cuts: describe the visual element that connects the two shots

**Temporal cues for video models:**
- "The scene begins with... and ends with..."
- "Over 4 seconds, the camera slowly pulls back to reveal..."
- "In the first half, [action A]; in the second half, [action B]"

**Reference frame strategy:**
- Identify 2-3 "anchor shots" that establish character/location look
- Generate these as still images first, then use as reference frames for video generation
- Note which shots should use image-to-video vs text-to-video

**Audio sync planning:**
- Note beat drops, dialogue cues, or SFX moments that shots should align with
- Mark shots as "on beat" or "off beat" for music-driven content

### 8. Style & Visual Continuity

Maintain consistent visual language across the entire storyboard:

- **Define a style guide** at the top: art style, color palette (specific hex or descriptive), overall mood, era/period, visual references
- **Color grading direction:** warm/cool, saturated/desaturated, specific LUT references if relevant
- **Consistent environment:** Track time of day, weather, location details across shots
- **Lighting continuity:** If Shot 1 is golden hour, Shot 2 in the same scene should maintain golden hour unless time skip is intended

### 9. Negative Constraints

Always include relevant negative prompts/constraints to avoid common AI artifacts:

**Standard exclusions:**
- Distorted/extra fingers, hands, limbs
- Warped text or illegible characters
- Inconsistent character appearance (wrong hair color, changed outfit)
- Watermarks, signatures, logos (unless intended)
- Blurry, low quality, oversaturated
- Cluttered backgrounds when clean composition is needed
- Multiple heads, merged faces, extra people

**Model-specific:** Adapt negative prompt format to the target model's syntax.

---

## WORKFLOW

1. **Gather inputs:** Script/concept, target platform, target model(s), duration, characters, style preferences
2. **Create character sheet(s)** for all recurring characters
3. **Define style guide** (mood, color palette, visual references)
4. **Determine shot count** based on duration and pacing
5. **Write the storyboard** shot by shot following the output format
6. **Review for continuity** — check character consistency, lighting, environment, narrative flow
7. **Add video/animation fields** if needed
8. **Format for target model** — adjust prompt syntax to the specific AI model

---

## EXAMPLE STORYBOARD HEADER

\`\`\`
# Storyboard: [Project Title]

**Platform:** Instagram Reels (9:16)
**Duration:** 30 seconds
**Target model:** ChatGPT Image (stills) + Runway Gen-3 (video)
**Style:** Cinematic, warm color palette, golden hour lighting
**Music mood:** Upbeat inspiring, build to crescendo at Shot 6

## Characters

**Character: Alex**
Age: 28, Male
Ethnicity: South Asian, medium brown skin
Hair: Black, short textured fade
Eyes: Dark brown
Build: Athletic, medium height
Outfit: Navy blue bomber jacket, white t-shirt, dark jeans, white sneakers
Distinguishing features: Silver watch on left wrist, small scar above right eyebrow
Expression baseline: Confident, slight smile

## Style Guide
Color palette: Warm amber, deep navy, cream white
Lighting: Golden hour throughout (late afternoon sun)
Environment: Modern urban rooftop, city skyline background
Visual reference: David Fincher meets Wes Anderson — precise framing with warm tones
\`\`\`

---

## REMINDERS

- Every image prompt must be **self-contained** — include all character, environment, and style details. Never assume the model has memory of previous prompts.
- Always confirm the target model before writing prompts — syntax varies significantly.
- Keep prompts at the sweet spot: detailed enough for accuracy, concise enough for model performance (150-300 words for image, 50-100 words for video).
- Plan the **hook shot** first — it determines whether the audience stays.
- When in doubt, lean toward more visual detail over less.
`;

export const Route = createFileRoute("/api/visual-storyboard")({
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
            .prepare("SELECT * FROM library WHERE id = ? AND type = ?")
            .bind(scriptId, "script")
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

        const characterNames = characters.map((c) => c.name);
        const characterRefs = characters.length > 0
          ? `Characters available: ${characterNames.join(", ")}. Reference relevant characters by name in shot visual_description fields when appropriate.`
          : "No specific characters provided.";

        const scriptContentText = scriptRow.content ? (typeof scriptRow.content === "string" ? scriptRow.content : JSON.stringify(scriptRow.content)) : "";

        const jsonOverride = `IMPORTANT: Regardless of the OUTPUT FORMAT section above, you MUST respond with ONLY valid JSON in this exact structure: {\"shots\": [{\"shot_number\": int, \"duration\": string, \"script_portion\": string, \"visual_description\": string, \"camera_angle\": string, \"transition\": string, \"image_prompt\": string, \"text_overlay\": string, \"text_overlay_position\": \"top\"|\"center\"|\"bottom\", \"voiceover\": string}]}. Use the skill's quality standards (character consistency, cinematography vocabulary, pacing, safe zones, negative-prompt thinking folded into image_prompt) to inform the CONTENT of each field, but the output must be this JSON shape only — no markdown headers, no prose summary, no extra sections.`;

        const systemPrompt = PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL + `\n\n${characterRefs}\n\n${jsonOverride}`;

        const userPrompt = `Script title: ${scriptRow.title}\nScript content:\n${scriptContentText}\n\nGenerate the storyboard shot list.`;

        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
        const requestPayload = {
          model: "auto",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };

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
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return Response.json({ error: `Anthropic API error: ${res.status}`, detail: errorText }, { status: 502 });
        }

        const data: { content?: Array<{ type: string; text?: string }> } = await res.json();
        const rawBody = JSON.stringify(data);

        let shots: Shot[] = [];
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
          console.error("JSON parse error after streaming:", parseErr);
          return Response.json(
            {
              error: "Failed to parse storyboard shots from model response",
              message: parseErr?.message ?? String(parseErr),
              raw: rawBody,
            },
            { status: 502 },
          );
        }

        if (shots.length === 0) {
          return Response.json(
            {
              error: "Failed to parse storyboard shots from model response",
              raw: rawBody,
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
              `INSERT INTO library (id, type, status, content_pillar, title, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              storyboardId,
              "storyboard",
              "draft",
              scriptRow.content_pillar ?? null,
              storyboardTitle,
              storyboardContent,
              now,
              now,
            )
            .run();
        } catch (err: any) {
          console.error("D1 insert error after streaming:", err);
          return Response.json(
            {
              error: `Failed to persist storyboard: ${err?.message ?? String(err)}`,
              message: err?.message ?? String(err),
              raw: rawBody,
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
