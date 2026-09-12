# 🚀 Content Production OS — Quick Start Guide

এই গাইডে যা জানতে হবে: কীভাবে প্রজেক্ট চালু করবে, deploy করবে, এবং testing করবে।

---

## 1️⃣ Local Development চালু করা

```bash
cd C:\dev\content-production
npm install
npm run dev
```

Browser-এ: `http://localhost:8080`  
Dev server: `http://localhost:8080/thumbnail-studio`

---

## 2️⃣ Deploy করতে (Cloudflare-এ)

### STEP A: CLOUDFLARE_API_TOKEN সেট করো (একবার)

1. https://dash.cloudflare.com/profile/api-tokens খুলো
2. **Create Token** → **Custom Token**
3. Permissions: **Workers Scripts:Edit** ✅ + **R2:Edit** ✅
4. Token copy করো

5. PowerShell-এ:
```powershell
$env:CLOUDFLARE_API_TOKEN = "token_paste_koro"
```

### STEP B: Deploy করো
```bash
npx wrangler deploy
```

6. **Live URL** পাবে (যেমন: `https://content-production.xxx.workers.dev`)

---

## 3️⃣ Settings-এ Key সেট করা

1. Live URL-এ যাও → **Settings** → **API Keys**
2. নিচে scroll → **"Image Generation"** section
3. **Workers AI — Model:** থেকে `flux-2-klein-4b` সিলেক্ট করো
4. **VyceAI — API Key:** বক্সে তোমার key paste করো (`sk-...`)
5. **Save image generation** চাপো
6. Status: **"Configured (...abc1)"** দেখাবে

---

## 4️⃣ Thumbnail Studio Test করা

1. `/thumbnail-studio` যাও
2. **VyceAI (Custom)** chip select করো
3. Prompt লেখো (≤2000 chars) — যেমন: `"dark studio with neon rim light"`
4. **Generate background** চাপো
5. ৫-১০ সেকেন্ডে ছবি tile-এ আসবে + canvas background হবে

**Workers AI Test (free, no key):**
1. **Workers AI** chip select করো
2. Prompt লেখো
3. Generate background → ছবি tile-এ আসবে

---

## 5️⃣ Important URLs

| Page | URL |
|---|---|
| Dashboard | `https://content-production.xxx.workers.dev/` |
| Thumbnail Studio | `https://content-production.xxx.workers.dev/thumbnail-studio` |
| Settings | `https://content-production.xxx.workers.dev/settings` |
| Ideator | `https://content-production.xxx.workers.dev/ideator` |

---

## 6️⃣ Key Commands

```bash
# Local dev
npm run dev
npm run cf:dev

# Build
npm run build
npx tsc --noEmit

# DB migrations (local)
npx wrangler d1 migrations apply content-os-db --local

# Deploy
npx wrangler deploy

# Check git status
git status
git log --oneline -5
```

---

## 7️⃣ Common Issues

| Problem | Solution |
|---|---|
| `CLOUDFLARE_API_TOKEN not set` | PowerShell-এ `$env:CLOUDFLARE_API_TOKEN = "..."` সেট করো |
| VyceAI key not working | Settings → Image Generation → Save → last4 check করো |
| Workers AI error | Local dev-এ কাজ করে না, deployed Worker-এ কাজ করবে |
| R2 bucket error | Dashboard থেকে `content-os-media` bucket আছে কিনা দেখো |
| Cron not firing | `wrangler.toml`-এ `[triggers]` syntax check করো |

---

## 8️⃣ Support Files Location

```
C:\dev\keys.txt              → Raw API keys (gitignored, safe)
C:\dev\content-production\   → Project root
C:\dev\content-production\CONTEXT.md    → Full context
C:\dev\content-production\QUICK_START.md → এই ফাইল
```

---

*Last updated: 2026-09-09*
