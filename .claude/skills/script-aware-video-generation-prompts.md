---
name: script-aware-video-generation-prompts
description: Turn a storyboard + script into shot-by-shot video prompts for Seedance, Kling, Omni, or Veo 3. Converts storyboard visual_descriptions and script dialogue/action into per-shot prompts with character-aware performance, camera, motion, timing.
---

# Script-Aware Video Generation Prompts

Convert a **storyboard** (shots with `visual_description`) plus a **script** (dialogue + action + emotion) into **shot-by-shot, production-ready video-generation prompts** for **Seedance, Kling, Omni, and Veo 3**.

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
2. **Storyboard** — per-shot `visual_description`, shot type, and any notes.
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
If the storyboard `visual_description` references a character, the prompt MUST direct **that character's** specific:
- body language & posture, weight shift
- facial reaction & micro-expression
- gaze direction (who/what they look at)
- hand/arm movement & gestures
- walking speed / pace
- emotion arc across the clip

Never settle for background/scene motion alone when a character is present.

### 3. Shot timing / beat mapping
Break the clip into a purposeful beat sequence, e.g. for a 6s clip:
`0–2s: character pauses, eyes down → 2–4s: turns toward camera → 4–6s: delivers line with a subtle, restrained smile.`
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
- Syntax: cinematic natural-language paragraph — `[shot type] + [subject + specific action/performance] + [camera movement] + [environment/lighting] + [mood/style]`. Put camera and motion cues explicitly.

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

## Output structure (per shot)

Produce an editable, structured block for every shot:

```
SHOT [id] — [script context / scene beat]
Recommended model + method: [e.g. Kling, image-to-video with anchor frame]
Shot type: [wide / medium / close-up / insert / OTS / POV]
Clip length: [e.g. 6s]

VIDEO PROMPT:
[Model-syntax visual prompt — subject action, camera, environment, mood]

CHARACTER PERFORMANCE & EXPRESSION:
[body language, gaze, hands, micro-expression, emotion arc]

MOTION:
- Subject: [...]
- Camera: [...]
- Environment: [...]
- Intensity: [subtle/restrained/natural/energetic/fast]

TIMING BEATS:
[0–2s ... / 2–4s ... / 4–6s ...]

START FRAME → END FRAME:
[start visual state] → [end visual state]

AUDIO / DIALOGUE (esp. Veo 3):
- Line (verbatim, [language]): "..."
- Speaker / tone / delivery: [...]
- Ambience / SFX / music: [...]
- Subtitle needed: [yes/no]

CONTINUITY LOCK:
- Inherits from prev shot: [pose/position/wardrobe/prop/lighting/emotion]
- Identity lock: [face/ref, wardrobe, hair, props, location, lighting]
- Hands off to next shot: [...]

NEGATIVE CONSTRAINTS:
[face drift, extra limbs, warped hands, flicker, broken physics, unwanted text, ...]

FALLBACK / SPLIT:
[risk note + safer prompt or split recommendation, if applicable]
```

For multi-shot deliveries, output one block per shot in script order, then a short **sequence-level continuity summary** (locked look, wardrobe, lighting, aspect ratio, fps).

---

## Prompt-language policy
- Visual/technical prompt text → **English** (model clarity).
- Dialogue lines → **verbatim** in original language (Bangla/English), in their own field with speaker + tone.
- Never mix spoken lines into the visual description.
