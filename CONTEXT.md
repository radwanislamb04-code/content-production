# 🧠 Content Production OS — Complete Project Context

**Date:** 2026-09-09  
**Repo:** `C:\dev\content-production`  
**Branch:** `main` (synced with origin/main)  
**Stack:** TanStack Start + React 19 + Tailwind v4 + Nitro SSR + Cloudflare Workers

---

## 🔴 CRITICAL BLOCKER — Deploy আটক

`npx wrangler deploy` চলে না কারণ `CLOUDFLARE_API_TOKEN` এনভায়রনমেন্টে নেই।

**সমাধান (২ মিনিট):**
1. https://dash.cloudflare.com/profile/api-tokens খুলো
2. **Create Token** → **Custom Token**
3. Permissions: **Workers Scripts:Edit** ✅ + **R2:Edit** ✅
4. Token কপি করো
5. PowerShell-এ:
   ```powershell
   $env:CLOUDFLARE_API_TOKEN = "token_paste_koro"
   ```
6. তারপর `npx wrangler deploy` চালাও

---

## ✅ যাহা হযেছে (পূর্ণ বিশ্লেষণ)

### Commits (8 টা — সব origin/main-এ push)
```
6b681f3 Fix React warning: KeyRow used value without onChange for uncontrolled fields
4cde627 Image generation: Workers AI + VyceAI providers, Settings key storage, studio chips
92c1a58 Fix cron trigger syntax in wrangler.toml
6c9ad23 Thumbnail Studio: fit right-side controls panel to viewport
062033c Fix D1 migrations; add R2, cron and Workers AI bindings
3864ce1 Thumbnail Studio: external image-gen flow and fit-to-viewport layout
1b7f550 fix: correct aspect ratios and move variant slots to filmstrip
d4a939d Added Thumbnail Studio screen
```

### Cloudflare Infrastructure
| Component | Status | Details |
|---|---|---|
| D1 DB `content-os-db` | ✅ | id: `25b209b2-1213-44c5-8b5f-1726001a3443` |
| KV namespace | ✅ | id: `e9050d4f-5952-4e32-a0b7-83a4b1a95384` |
| R2 bucket `content-os-media` | ✅ | dashboard থেকে তৈরি (0 B) |
| Workers AI `[ai]` binding | ✅ | bound, no key needed |
| Cron triggers | ✅ | `0 9 * * *` (সকাল ৯টা) + `0 */3 * * *` (প্রতি ৩ ঘণ্টা) |

### Local Development DB
- All 6 migrations applied to local D1 (`.wrangler/state/v3/d1/`)
- Tables: `library` (12 cols), `post_performance` (10 cols), `projects` (7 cols), `activity`, `resources`, `telegram_tasks`, `workspace`

---

## 🎨 Thumbnail Studio — সম্পূর্ণ বর্ণনা

**File:** `src/components/aios/sections/ThumbnailStudioScreen.tsx` (660 lines)

### 1. Canvas (বাম পাশ)
- Format toggle: `16:9 YouTube` / `9:16 Reels`
- Aspect-ratio locked preview box
- `backgroundImage` derived from selected tile's uploaded/generated image
- Shows placeholder "No background generated yet" when nothing loaded
- Text layer always live on canvas (headline + subline)
- Character layer placeholder (hasCharacter = false, disabled controls)

### 2. 4 Variant Tiles (Canvas-এর নিচে)
- Horizontal filmstrip, scrollable if overflow
- Each tile: `aspectRatio: format`, `height: 64px`
- Click → hidden `<input type="file">` opens
- Drag-drop supported (lime border highlight during drag)
- ✕ overlay button clears tile image
- Selected tile gets `border-lime ring-2 ring-lime` highlight
- Selected tile's image → canvas background (live)
- URL input row below: "Or paste an image URL" + input + "Use" button

### 3. Right Panel (Controls)
Fit-to-viewport at 1366×768, no page scroll:
- **Tabs:** Background / Character / Text
- **Background tab content (top to bottom):**
  1. Prompt textarea (3 rows)
  2. Style presets: Studio, Neon, Gradient, Office, Abstract, Outdoor
  3. Provider chips row (see below)
  4. Caption: "Workers AI and VyceAI generate inside the app; Gemini, ChatGPT and arena.ai open in a new tab."
  5. Generate background button
  6. Hint text (shows after click)
  7. Clipboard fallback textarea (shows if clipboard API fails)
  8. 3 layer toggles: Background ✓ / Character ✓ / Text ✓
  9. Download PNG + Save to Library buttons (title="Not wired up yet")
- **Text tab:** Headline input, Subline input, Font size slider (4-18), Position grid (3×3), Alignment segmented, Color swatches (6), Outline toggle
- **Character tab:** Empty state + placeholder (not yet implemented)

### 4. Provider Chips (SITES array — 5 items)
```js
const SITES = [
  { id: "workers-ai",   label: "Workers AI",        url: null },
  { id: "vyceai",       label: "VyceAI (Custom)",   url: null },
  { id: "gemini",       label: "Gemini",            url: "https://gemini.google.com/app" },
  { id: "chatgpt",      label: "ChatGPT (Plus)",    url: "https://chatgpt.com/" },
  { id: "arena",        label: "arena.ai",          url: "https://arena.ai/image/side-by-side?model_a=seedream-5.0-pro&model_b=gpt-image-1" },
];
```
Default: `workers-ai`

**Chips with `url === null` do NOT open a new tab.** Instead they trigger in-app generation via POST `/api/generate-image`.

**Workers AI model Select:** Only renders when `site === "workers-ai"`. Options from `AI_MODEL_OPTIONS` (3 flux models). Default from `/api/settings-imagegen` on mount.

### 5. handleGenerate() — Full Logic
```
if site is workers-ai or vyceai:
  - empty prompt → error "Write a prompt first"
  - set generating=true, button disabled, label "Generating…"
  - POST /api/generate-image { prompt, provider: site, model: aiModel }
  - on success → load data.url into selected tile (or tile 0), select it, show hint "Image ready — edit the headline and download PNG."
  - on error → show error text under button, no tile change
  - finally → set generating=false, restore button label

if site is gemini/chatgpt/arena:
  - try navigator.clipboard.writeText(prompt)
  - if fails → show clipboardFallback textarea (read-only, pre-filled)
  - window.open(siteUrl, "_blank")
  - show hint: "Prompt copied — paste it into the opened site..."
```

---

## ⚙️ Settings Page — সম্পূর্ণ বর্ণনা

**File:** `src/components/aios/sections/Settings.tsx` (445 lines)

### Structure
```
Settings() → Tab sidebar (left) + Content (right)
  Sidebar tabs: API Keys | Instagram | Telegram | Schedule | Characters | Appearance

API Keys tab → ApiKeys() component:
  ┌─ AI Brain ─────────────────────────────┐
  │  manifest.build — Base URL             │
  │  manifest.build — API Key (masked)     │
  └────────────────────────────────────────┘

  ┌─ Image Generation ────────────────────┐  ← NEW
  │  Workers AI — Model (Select + badge)   │
  │  VyceAI — API Key (masked input)       │
  │  VyceAI — Model (badge: grok-imagine-2)│
  │  [Save image generation] button        │
  └────────────────────────────────────────┘

  ┌─ Scrapers — Apify ────────────────────┐
  │  Slot cards (4 default + Add slot)     │
  └────────────────────────────────────────┘

  ┌─ Data Sources ────────────────────────┐
  │  YouTube Data API Key                  │
  │  SerpApi Key                           │
  │  Reddit Client ID / Secret             │
  │  Product Hunt Developer Token          │
  │  Hacker News (badge: No key required)  │
  └────────────────────────────────────────┘

  ┌─ Notifications ───────────────────────┐
  │  Telegram Bot Token (masked)           │
  │  Telegram Chat ID                      │
  └────────────────────────────────────────┘

  Warning banner: "Image-generation keys are saved to Cloudflare KV..."
```

### Image Generation Section — Detail
On mount: `fetch("/api/settings-imagegen")` → populates `igDefaultModel`, `igVyceaiConfigured`, `igVyceaiLast4`

Save button handler:
```
POST /api/settings-imagegen
Body: { defaultModel: igDefaultModel, vyceaiKey: igKeyInput (if non-empty) }
On success: toast.success("Image generation settings saved")
            update configured/last4 state, clear input
On error: toast.error(message)
```

### KeyRow Component
- Props: `label`, `masked` (default false), `placeholder`, `value`, `onChange`, `status`
- If `masked && onChange` → controlled input (password type when masked)
- If `masked && !onChange` → uncontrolled (defaultValue)
- Show/hide eye button when masked
- Status line below input (e.g., "Configured (...abc1)" or "Not configured")
- Save icon button per row (Tooltip: "Saving is not wired up yet" — only works for Image Generation section)

---

## 🔌 API Routes — সম্পূর্ণ বর্ণনা

### `src/routes/api/generate-image.ts`
**Method:** POST  
**Auth:** None (reads key from KV/env internally)

**Request body:**
```json
{ "prompt": "string (1-4000 chars)", "provider": "workers-ai | vyceai", "model?": "string" }
```

**Workflow:**
1. Parse + validate body with Zod
2. Whitelist check for workers-ai model
3. Look up handler in `PROVIDERS` registry
4. Call handler, return `{ ok, url, provider, model }` or `{ ok, error }`

**Workers AI handler:**
```ts
if (!env?.AI) → return { ok: false, error: "Workers AI runs only after deploy" }
useModel = whitelist check (default: flux-2-klein-4b)
result = await env.AI.run(useModel, { prompt })
Convert result to Blob (handles Blob, ReadableStream, Response-like)
→ base64 data URL
return { ok: true, url: "data:image/...;base64,...", provider: "workers-ai", model }
```

**VyceAI handler:**
```ts
key = await readVyceaiKey(env)  // KV first, then env.VYCE_API_KEY fallback
if (!key) → return { ok: false, error: "VyceAI key not set..." }
res = await fetch("https://vyceai.com/v1/images/generations", {
  POST, headers: { Authorization: Bearer ${key} },
  body: { model: "grok-imagine-2", prompt, size: "1024x1024", response_format: "url" }
})
if !res.ok → return { ok: false, error: "VyceAI error ${status}: ${snippet}" }
url = json.data[0]?.url
return { ok: true, url, provider: "vyceai", model: "grok-imagine-2" }
```

**Note:** NEVER logs raw API key. Local dev returns graceful errors (not crashes).

### `src/routes/api/settings-imagegen.ts`
**Methods:** GET / POST

**GET →**
```json
{
  "vyceai": { "configured": boolean, "last4": string|null },
  "defaultModel": string,
  "allowedModels": ["@cf/black-forest-labs/flux-2-klein-4b", ...]
}
```
NEVER returns full key — only last4 chars.

**POST →**
```json
Body: { vyceaiKey?: string, clearVyceai?: boolean, defaultModel?: string }
```
- `clearVyceai=true` → deletes KV key
- `vyceaiKey` set → writes to `settings:imagegen:vyceai`
- `defaultModel` set → validates against whitelist, writes to `settings:imagegen:default-model`
- Returns same shape as GET + `{ ok: true }`

**KV keys:**
- `settings:imagegen:vyceai` — full VyceAI API key (secret)
- `settings:imagegen:default-model` — selected Workers AI model

---

## 📁 File Structure Summary

```
src/
  routes/
    api/
      generate-image.ts      ← NEW: in-app image generation
      settings-imagegen.ts   ← NEW: KV settings read/write
      scrape-competitor.ts   ← existing pattern reference
      activity.ts
      library.$type.ts / library.$type.$id.ts
      projects.ts
      resources.ts
      telegram-cron.ts
      ideator-generate.ts
      hook-script-writer.ts
      trend-spy.ts / trends.ts
      video-analyzer.ts
      video-gen-prompt.ts
      visual-storyboard.ts
      workspace.selected_idea.ts
      search.ts
      scripts-list.ts
      embed-check.ts
      characters.ts

  components/
    aios/
      sections/
        ThumbnailStudioScreen.tsx  ← modified: +5 providers, model select, generate branching
        Settings.tsx               ← modified: +Image Generation section, KeyRow fix

migrations/
  001_init.sql
  002_resources.sql
  003_content_quality.sql
  004_ideator_fields.sql
  005_post_performance.sql
  006_source_id.sql

wrangler.toml     ← modified: [triggers] cron fixed, MEDIA/AI bindings added
package.json      ← unchanged (no new deps)
```

---

## 🗺️ Roadmap — কী বাকি আছে

| Phase | Task | Status |
|---|---|---|
| — | **Deploy to Cloudflare** | ❌ Blocked: needs CLOUDFLARE_API_TOKEN |
| — | **Test VyceAI image gen (live)** | ⏳ After deploy |
| — | **Test Workers AI image gen (live)** | ⏳ After deploy |
| 6 | 8-site scraper integration (Reddit, Product Hunt, etc.) | ⏳ Not started |
| 7 | Full Settings save (Apify slots, Data Sources, Notifications → KV) | ⏳ Not started |
| 9 | Morning Telegram brief (cron 0 9 * * *) | ⏳ Not started |
| 12 | Final deployment + monitoring | ⏳ Not started |

---

## 📋 Next AI Session — First 3 Actions

```
1. Confirm CLOUDFLARE_API_TOKEN is set in the environment
2. npx wrangler deploy
3. Note the live URL (e.g. https://content-production.xxx.workers.dev)

Then visit:
- <url>/settings → API Keys → Image Generation → paste VyceAI key → Save
- <url>/thumbnail-studio → select "VyceAI (Custom)" chip → type prompt → Generate
- Also test "Workers AI" chip (no key needed, free)

Both should produce images that land in the tile and appear as canvas background.
```

---

## 🔑 Key Storage Summary

| Key | Where stored | How accessed |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Shell env (PowerShell) | wrangler CLI only |
| `VYCE_API_KEY` (secret) | Cloudflare secrets OR KV `settings:imagegen:vyceai` | generate-image.ts reads KV first, env fallback |
| APIFY tokens | `C:\dev\keys.txt` (local file) | Phase 7: wire to Apify slots in Settings |
| YouTube/SerpApi/Reddit keys | `C:\dev\keys.txt` (local file) | Phase 7: wire to Data Sources in Settings |
| Telegram Bot Token | `C:\dev\keys.txt` (local file) | Phase 9: wire to Notifications in Settings |

**Rule:** Never commit API keys. `C:\dev\keys.txt` is gitignored. Secrets go to Cloudflare KV or `wrangler secret put`.

---

*Generated from actual codebase analysis on 2026-09-09. All code references current as of commit 6b681f3.*
