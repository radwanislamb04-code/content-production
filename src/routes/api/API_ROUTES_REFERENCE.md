# API Routes Reference — `src/routes/api/`

Base URL: `/api/*`

---

## 1. `POST /api/ideator-generate`

Generate content ideas from a source.

**Request body:**
```json
{
  "source": "my_posts" | "competitor" | "trend",
  "source_data": unknown[]
}
```
- `source` (string, required) — one of `my_posts`, `competitor`, `trend`
- `source_data` (array, required) — raw source items

**Response (200):**
```json
{
  "ideas": [
    {
      "id": "uuid",
      "title": "string",
      "why_it_works": "string",
      "tags": ["string"],
      "format": "string",
      "content_pillar": "string",
      "status": "draft"
    }
  ]
}
```

**Errors:** `400` (bad JSON / invalid source / missing array), `500` (env missing), `502` (Anthropic error / no parseable ideas)

---

## 2. `POST /api/hook-script-writer`

Generate a viral script from an idea row.

**Request body:**
```json
{
  "idea_id": "string"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "type": "script",
  "status": "draft",
  "content_pillar": "string|null",
  "title": "Script: ...",
  "idea_id": "string",
  "script": {
    "hooks": [
      { "spoken": "string", "formula": "string", "visual": "string", "text_overlay": "string" }
    ],
    "body": "string",
    "cta": "string",
    "formatted": "string"
  },
  "created_at": number,
  "updated_at": number
}
```

**Errors:** `400` (invalid/missing `idea_id`), `404` (idea not found), `500` / `502`

---

## 3. `POST /api/visual-storyboard`

Generate storyboard shots from a script.

**Request body:**
```json
{
  "script_id": "string",
  "characters": [
    { "name": "string", "description": "string" }
  ]
}
```
- `characters` optional array

**Response (200):**
```json
{
  "storyboard_id": "uuid",
  "script_id": "string",
  "shot_count": 5,
  "shots": [
    {
      "shot_number": 1,
      "duration": "string",
      "script_portion": "string",
      "visual_description": "string",
      "camera_angle": "string",
      "transition": "string",
      "image_prompt": "string",
      "text_overlay": "string",
      "text_overlay_position": "top" | "center" | "bottom",
      "voiceover": "string"
    }
  ]
}
```

**Errors:** `400`, `404` (script not found), `500`, `502` (parse failure after 3 attempts)

---

## 4. `POST /api/video-gen-prompt`

Generate video-generation prompts from a storyboard.

**Request body:**
```json
{
  "storyboard_id": "string",
  "model": "seedance" | "omni" | "veo3",
  "aspect_ratio": "9:16" | "16:9" | "1:1",
  "quality": "string"
}
```

**Response (200):**
```json
{
  "video_prompt_id": "uuid",
  "storyboard_id": "string",
  "model": "string",
  "aspect_ratio": "string",
  "quality": "string",
  "prompts": [
    {
      "shot_number": 1,
      "duration": "string",
      "video_prompt": "string",
      "negative_prompt": "string",
      "camera_motion": "string"
    }
  ]
}
```

**Errors:** `400` (missing/invalid fields), `404` (storyboard missing), `500`, `502`

---

## 5. `/api/library/$type` — GET + POST

File: `library.$type.ts`

### GET `/api/library/{type}`
- Path param: `type` (string)
- No body

**Response (200):** array of library rows
```json
[
  {
    "id": "string",
    "type": "string",
    "status": "string | null",
    "content_pillar": "string | null",
    "title": "string",
    "content": "string",
    "created_at": number,
    "updated_at": number
  }
]
```

### POST `/api/library/{type}`
**Request body:**
```json
{
  "id": "string",
  "title": "string",
  "content": "string",
  "source_id": "string?",
  "quality_score": 0,
  "quality_analysis": "string?"
}
```
- Required: `id`, `title`, `content`

**Response (200):** `{ ok: true, id: "string" }`

---

## 6. `/api/library/$type/$id`

File: `library.$type.$id.ts`

### GET `/api/library/{type}/{id}`
**Response (200):** single library row object (same fields as above)

### PUT `/api/library/{type}/{id}`
**Request body:** partial update
```json
{
  "title": "string?",
  "content": "string?",
  "quality_score": number?,
  "quality_analysis": "string?"
}
```
- At least one of the above must be present

**Response (200):** `{ ok: true }`

### DELETE `/api/library/{type}/{id}`
**Response (200):** `{ ok: true }`

---

## 7. `GET` + `POST` `/api/activity`

File: `activity.ts`

### GET `/api/activity`
**Response (200):** array of activity rows (latest 100)
```json
[
  { "id": "string", "module": "string", "action": "string", "detail": "string", "created_at": number }
]
```

### POST `/api/activity`
**Request body:**
```json
{
  "id": "string?",
  "module": "string",
  "action": "string",
  "detail": "string?",
  "created_at": number?
}
```
- Required: `module`, `action`

**Response (200):** `{ success: true, id: "string" }`

---

## 8. `GET` `/api/projects`

File: `projects.ts`

**Response (200):** array of project rows
```json
[
  { "id": "string", "title": "string", ... }
]
```

---

## 9. `GET` + `POST` `/api/resources`

File: `resources.ts`

### GET `/api/resources`
**Response (200):** array of resource rows
```json
[
  { "id": "string", "name": "string", "url": "string", "category": "string", "iframe": 0, "created_at": number }
]
```

### POST `/api/resources`
**Request body:**
```json
{
  "url": "string (valid URL, max 500 chars)",
  "name": "string (1-80 chars)",
  "category": "Video Download" | "Trends" | "Creator Research" | "Writing" | "AI Tools" | "AI Video"
}
```

**Response (201):** the created resource object

---

## 10. `GET` `/api/search`

File: `search.ts`

Query param: `q` (search string)

**Response (200):**
```json
{
  "projects": [ { ... } ],
  "library": [ { ... } ]
}
```

---

## 11. `GET` + `PUT` `/api/workspace/selected_idea`

File: `workspace.selected_idea.ts`

### GET `/api/workspace/selected_idea`
Returns workspace idea keys (`idea_0`, `idea_1`, ...)

**Response (200):**
```json
[
  { "key": "idea_0", "value": "string", "updated_at": number }
]
```

### PUT `/api/workspace/selected_idea`
**Request body:**
```json
{
  "ideas": ["string (max 50, max 500 chars each)"]
}
```
- Array max length: `50`

**Response (200):** `{ ok: true, count: number }`

---

## 12. `GET` + `POST` `/api/characters`

File: `characters.ts`

### GET `/api/characters`
Returns library rows where `type = 'character'` with parsed `content`.

**Response (200):** array of character objects
```json
[
  {
    "id": "string",
    "type": "character",
    "status": "active",
    "title": "string",
    "content": {
      "name": "string",
      "description": "string",
      "avatar_url": "string",
      "in_use": boolean
    },
    "created_at": number,
    "updated_at": number
  }
]
```

### POST `/api/characters`
**Request body:**
```json
{
  "name": "string",
  "description": "string?",
  "avatar_url": "string?",
  "in_use": boolean?
}
```
- Required: `name`

**Response (200):** created character object (same shape as above)

---

## 13. `GET` `/api/scripts-list`

File: `scripts-list.ts`

**Response (200):** array of script summary rows (type=`script`)
```json
[
  { "id": "string", "title": "string", "content_pillar": "string | null", "created_at": number }
]
```

---

## Quick Integration Notes

- Routes requiring Anthropic: `ideator-generate`, `hook-script-writer`, `visual-storyboard`, `video-gen-prompt` require `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` env vars.
- Routes requiring D1 (`DB` env): all except possibly some that fall back to empty arrays.
- All POST handlers return `400` for invalid JSON or missing fields, `404` for missing DB rows, `500` for DB/env errors, `502` for Anthropic/parse failures.
- Library persistence uses `ON CONFLICT(id) DO UPDATE` upserts.
