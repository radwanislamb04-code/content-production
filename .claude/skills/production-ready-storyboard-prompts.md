---
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

```
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
```

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
  ```
  **Character: [Name]**
  Age: [specific], Gender: [specific]
  Ethnicity/skin tone: [specific description]
  Hair: [color, length, style]
  Eyes: [color, shape]
  Build: [body type]
  Outfit: [exact clothing with colors and details]
  Distinguishing features: [scars, glasses, accessories, tattoos]
  Expression baseline: [default demeanor]
  ```

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
- Example: `with bold white sans-serif text "LEVEL UP" centered in the upper third`
- ⚠️ AI models often struggle with text accuracy — keep text short (1-4 words), use simple fonts, and plan for post-production touch-up

**Text overlay (separate field, added in post):**
- Use for: subtitles, captions, CTAs, dynamic text, multi-language text, precise typography
- Specify in the `text_overlay` field, not in the image prompt
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

```
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
```

---

## REMINDERS

- Every image prompt must be **self-contained** — include all character, environment, and style details. Never assume the model has memory of previous prompts.
- Always confirm the target model before writing prompts — syntax varies significantly.
- Keep prompts at the sweet spot: detailed enough for accuracy, concise enough for model performance (150-300 words for image, 50-100 words for video).
- Plan the **hook shot** first — it determines whether the audience stays.
- When in doubt, lean toward more visual detail over less.
