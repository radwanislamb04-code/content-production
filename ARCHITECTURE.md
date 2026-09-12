# 🏗️ Architecture & Code Reference

এই ডকুমেন্টে প্রজেক্টের আর্কিটেকচার, key components, এবং code structure বর্ণনা করা হয়েছে।

---

## 1️⃣ Tech Stack

```
Frontend:  React 19 + TypeScript + Tailwind v4
Framework: TanStack Start (SSR + Client)
Runtime:   Cloudflare Workers
Database:  Cloudflare D1 (SQLite)
Storage:   Cloudflare KV (key-value, settings)
Objects:   Cloudflare R2 (images, media)
AI:        Workers AI (in-app, free) + VyceAI (external)
Build:     Vite + Nitro SSR
```

---

## 2️⃣ Project Structure

```
content-production/
├── src/
│   ├── routes/
│   │   ├── api/                    ← API routes (server-only)
│   │   │   ├── generate-image.ts   ← POST: image generation
│   │   │   ├── settings-imagegen.ts← GET/POST: KV settings
│   │   │   ├── scrape-competitor.ts← POST: Instagram scraper
│   │   │   ├── ideator-generate.ts ← POST: ideator
│   │   │   └── ... (15+ routes)
│   │   └── __root.tsx             ← Root layout
│   │
│   ├── components/
│   │   └── aios/
│   │       └── sections/
│   │           ├── ThumbnailStudioScreen.tsx ← Main editor
│   │           ├── Settings.tsx               ← Settings page
│   │           └── ... (other screens)
│   │
│   └── ...
│
├── migrations/
│   ├── 001_init.sql
│   ├── 002_resources.sql
│   ├── 003_content_quality.sql
│   ├── 004_ideator_fields.sql
│   ├── 005_post_performance.sql
│   └── 006_source_id.sql
│
├── wrangler.toml          ← Cloudflare bindings config
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3️⃣ Data Flow

### Thumbnail Generation (In-App)
```
User types prompt → Selects provider chip
         ↓
handleGenerate() called
         ↓
if workers-ai or vyceai:
    POST /api/generate-image { prompt, provider, model }
         ↓
    generate-image.ts handler
         ↓
    workers-ai: env.AI.run(model, { prompt }) → Blob → data URL
    vyceai: fetch(vyceai.com, { Authorization: Bearer <key> }) → URL
         ↓
    Return { ok, url }
         ↓
    Frontend loads url into selected tile
         ↓
    Tile image → canvas background (live preview)
```

### External Site Flow
```
User selects Gemini/ChatGPT/arena chip
         ↓
handleGenerate() called
         ↓
navigator.clipboard.writeText(prompt)
         ↓
window.open(siteUrl, "_blank")
         ↓
User pastes prompt, generates image manually
         ↓
User downloads image, drags to tile
         ↓
handleFileSelect() → blob URL → canvas background
```

### Settings Save Flow
```
User enters VyceAI key → clicks Save
         ↓
handleSaveImageGen()
         ↓
POST /api/settings-imagegen { vyceaiKey, defaultModel }
         ↓
settings-imagegen.ts handler
         ↓
kv.put("settings:imagegen:vyceai", key)
kv.put("settings:imagegen:default-model", model)
         ↓
Return { ok, vyceai: {configured, last4}, defaultModel }
         ↓
Update UI: status "Configured (...abc1)"
```

---

## 4️⃣ Key Components

### ThumbnailStudioScreen.tsx (660 lines)

**State variables:**
```ts
const [format, setFormat] = useState<"yt"|"reels">("yt");
const [tab, setTab] = useState("background");
const [showBg, setShowBg] = useState(true);
const [showChar, setShowChar] = useState(true);
const [showText, setShowText] = useState(true);
const [prompt, setPrompt] = useState("");
const [preset, setPreset] = useState<string|null>(null);
const [headline, setHeadline] = useState("YOUR HEADLINE");
const [subline, setSubline] = useState("");
const [fontSize, setFontSize] = useState(9);
const [pos, setPos] = useState<Pos>(4);
const [align, setAlign] = useState<Align>("center");
const [color, setColor] = useState("fg");
const [outline, setOutline] = useState(true);
const [selectedVariant, setSelectedVariant] = useState<number|null>(null);
const [site, setSite] = useState<SiteKey>("workers-ai");
const [variantImages, setVariantImages] = useState<Record<number,string>>({});
const [imageUrl, setImageUrl] = useState("");
const [clipboardFallback, setClipboardFallback] = useState<string|null>(null);
const [showGenerateHint, setShowGenerateHint] = useState(false);
const [dragOverIndex, setDragOverIndex] = useState<number|null>(null);
const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
const [generating, setGenerating] = useState(false);
const [generateError, setGenerateError] = useState<string|null>(null);
const [inAppHint, setInAppHint] = useState<string|null>(null);
```

**Key functions:**
- `handleGenerate()` — main entry point
- `handleFileSelect(index, file)` — file upload handler
- `handleClearTile(index, e)` — clear tile handler
- `handleTileClick(index)` — select tile handler
- `handleUrlSubmit()` — URL input handler

### Settings.tsx (445 lines)

**Image Generation state:**
```ts
const IG_ALLOWED_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
];
const [igDefaultModel, setIgDefaultModel] = useState(IG_ALLOWED_MODELS[0]);
const [igVyceaiConfigured, setIgVyceaiConfigured] = useState(false);
const [igVyceaiLast4, setIgVyceaiLast4] = useState<string|null>(null);
const [igKeyInput, setIgKeyInput] = useState("");
const [igSaving, setIgSaving] = useState(false);
```

**Key function:**
- `handleSaveImageGen()` — POST /api/settings-imagegen

### generate-image.ts (194 lines)

**PROVIDERS registry:**
```ts
const PROVIDERS: Record<string, (args) => Promise<ProviderResult>> = {
  "workers-ai": async ({ prompt, model, env }) => { /* ... */ },
  "vyceai": async ({ prompt, env }) => { /* ... */ },
};
```

**Key functions:**
- `blobToDataUrl(blob)` — convert Blob to base64 data URL
- `readVyceaiKey(env)` — resolve key from KV or secret
- `handleGenerate()` — POST route handler

### settings-imagegen.ts (148 lines)

**Key functions:**
- `last4(key)` — extract last 4 characters of key
- `getKv(env)` — get KV namespace from env
- `GET handler` — read settings from KV
- `POST handler` — write settings to KV

---

## 5️⃣ Database Schema

### library table (12 columns)
| Column | Type | Description |
|---|---|---|
| id | TEXT | Primary key |
| type | TEXT | Content type |
| title | TEXT | Title |
| content | TEXT | Content body |
| project_id | TEXT | FK to projects |
| created_at | INTEGER | Unix timestamp |
| updated_at | INTEGER | Unix timestamp |
| quality_score | INTEGER | Quality score (0-100) |
| quality_analysis | TEXT | Quality analysis JSON |
| status | TEXT | draft/published/etc |
| content_pillar | TEXT | Content pillar |
| source_id | TEXT | Source reference |

### post_performance table (10 columns)
| Column | Type | Description |
|---|---|---|
| id | TEXT | Primary key |
| handle | TEXT | Social handle |
| is_own_account | INTEGER | 0/1 |
| caption | TEXT | Post caption |
| likes | INTEGER | Like count |
| comments | INTEGER | Comment count |
| url | TEXT | Post URL |
| posted_at | TEXT | Post date |
| project_id | TEXT | FK to projects |
| scraped_at | INTEGER | Unix timestamp |

### projects table (7 columns)
| Column | Type | Description |
|---|---|---|
| id | TEXT | Primary key |
| title | TEXT | Project name |
| module | TEXT | Module name |
| status | TEXT | active/inactive |
| pipeline_step | TEXT | Current step |
| created_at | INTEGER | Unix timestamp |
| updated_at | INTEGER | Unix timestamp |

---

## 6️⃣ Cloudflare Bindings

### wrangler.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "content-os-db"
database_id = "25b209b2-..."
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "e9050d4f-..."

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "content-os-media"

[triggers]
crons = ["0 9 * * *", "0 */3 * * *"]

[ai]
binding = "AI"
```

### Binding access in code
```ts
const env = (context as any).cloudflare?.env;
const db = env?.DB;       // D1 database
const kv = env?.KV;       // KV namespace
const media = env?.MEDIA; // R2 bucket
const ai = env?.AI;       // Workers AI
```

---

## 7️⃣ API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate-image` | In-app image generation |
| GET | `/api/settings-imagegen` | Read settings from KV |
| POST | `/api/settings-imagegen` | Save settings to KV |
| POST | `/api/scrape-competitor` | Scrape Instagram posts |
| POST | `/api/ideator-generate` | Generate ideator content |
| POST | `/api/hook-script-writer` | Write hooks/scripts |

---

## 8️⃣ Cron Schedule

| Schedule | Task | Status |
|---|---|---|
| `0 9 * * *` | Daily content brief | ⏳ Not wired yet |
| `0 */3 * * *` | Competitor viral check | ⏳ Not wired yet |

---

*Last updated: 2026-09-09*
