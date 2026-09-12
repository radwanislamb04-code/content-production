# 🔐 Security & API Key Management Guide

এই গাইডে বলা আছে কীভাবে API keys handle করবে, কোথায় রাখবে, এবং কীভাবে secure রাখবে।

---

## 1️⃣ Keys কোথায় রাখবে

### ✅ Safe locations

| Key | Location | Access |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | PowerShell env (`$env:CLOUDFLARE_API_TOKEN`) | wrangler CLI only |
| `VYCE_API_KEY` | Cloudflare KV (`settings:imagegen:vyceai`) | `/api/generate-image` route |
| `VYCE_API_KEY` (fallback) | Cloudflare Secret (`wrangler secret put VYCE_API_KEY`) | env vars |
| APIFY tokens | `C:\dev\keys.txt` (local file, gitignored) | Phase 7-এ wire হবে |
| YouTube/SerpApi/Reddit | `C:\dev\keys.txt` (local file) | Phase 7-এ wire হবে |
| Telegram Bot Token | `C:\dev\keys.txt` (local file) | Phase 9-এ wire হবে |

### ❌ Never do these
- কখনোই keys `git commit` করো না
- কোনো file-এ raw key লিখো না
- Console/logs-এ key print করো না
- Email/Chat-এ key share করো না
- `.dev.vars` commit করো না

---

## 2️⃣ Kীভাবে Key Store হয়

### KV (Cloudflare Key-Value)
```ts
// settings-imagegen.ts POST handler
await kv.put("settings:imagegen:vyceai", body.vyceaiKey);
await kv.put("settings:imagegen:default-model", body.defaultModel);
```

**Readback:**
```ts
const stored = await kv.get("settings:imagegen:vyceai");
return { last4: stored?.slice(-4) ?? null }; // full key নাকি
```

### Secrets (wrangler secret)
```bash
wrangler secret put VYCE_API_KEY
```
Code-এ: `env.VYCE_API_KEY`

**Priority:** KV first → Secret fallback → return error

---

## 3️⃣ Key Rotation

### VyceAI key change
1. Settings → API Keys → Image Generation
2. New key paste করো
3. Save চাপো
4. পুরোনো key KV-তে overwrite হবে
5. পুরোনো key আর কাজ করবে না

### CLOUDFLARE_API_TOKEN rotate
1. Cloudflare dashboard → API Tokens → Delete old token
2. নতুন token বানাও
3. PowerShell-এ: `$env:CLOUDFLARE_API_TOKEN = "new_token"`
4. নতুন token-এর permissions: Workers Scripts:Edit + R2:Edit

---

## 4️⃣ Keys.txt File (Local Backup)

```
# C:\dev\keys.txt
# Format: KEY_NAME=value

APIFY_TOKENS=
  slot1=apify_api_token_1
  slot2=apify_api_token_2
  slot3=apify_api_token_3
  slot4=apify_api_token_4

REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

PRODUCT_HUNT_TOKEN=your_ph_token

YOUTUBE_API_KEY=your_youtube_key
SERPAPI_KEY=your_serpapi_key

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id

MANIFEST_BASE_URL=https://your-manifest-url
MANIFEST_API_KEY=your_manifest_key

VYCEAI_API_KEY=sk-your-vyceai-key
```

**বিশেষ নোট:** এই ফাইলটি `C:\dev\keys.txt`-এ রাখো, project-এর বাইরে। `.gitignore`-এ এটা আছে।

---

## 5️⃣ Audit Checklist

| Check | Status |
|---|---|
| কোনো key git-এ commit হয়নি? | ✅ (audit করা হযেছ) |
| `keys.txt` gitignored? | ✅ |
| `.dev.vars` commit হয়নি? | ✅ |
| API routes-এ key log হয় না? | ✅ ( NEVER logs raw key) |
| Settings UI-তে key masked? | ✅ (eye button with show/hide) |
| KV-তে key last4-এ দেখায়? | ✅ |

---

## 6️⃣ কীভাবে Key Add করবে (নতুন provider)

### Step 1: Provider config করো
```ts
// generate-image.ts-এ PROVIDERS registry-তে add করো
const PROVIDERS = {
  // ...existing
  "new-provider": async ({ prompt, env }) => {
    const key = await readKey(env); // KV or secret
    // ...call API
  },
};
```

### Step 2: Settings UI-তে field add করো
```tsx
// Settings.tsx-এ Image Generation section-এ add করো
<KeyRow label="New Provider — API Key" masked status={...} />
```

### Step 3: KV key store করো
```ts
// settings-newprovider.ts route বানাও
kv.put("settings:newprovider:key", key);
```

---

## 7️⃣ Emergency: Key Compromise হলে

1. **Immediately:** Cloudflare dashboard থেকে key revoke করো
2. **VyceAI:** https://dashboard.vyceai.com → API Keys → Regenerate
3. **CLOUDFLARE_API_TOKEN:** https://dash.cloudflare.com/profile/api-tokens → Delete
4. **Update:** নতুন key Settings-এ paste করো
5. **Check:** কোনো key git-এ leak হয়েছে কিনা দেখো
   ```bash
   git log --all --full-history -p -- '*.txt' '*.env' '*.json' | grep -i "sk-\|api_key\|token"
   ```

---

## 8️⃣ Best Practices

1. **প্রতি মাসে** key rotate করো (ব্যাকআপ সহ)
2. **Least privilege** token ব্যবহার করো (শুধু প্রয়োজনীয় permission)
3. **Environment-specific** keys ব্যবহার করো (dev vs prod)
4. **Never** keys commit করো — even in private repo
5. **Always** use `last4` display in UI (full key নয়)
6. **Regularly** audit `git log` for accidental key leaks

---

*Security is not a feature — it's the foundation. Stay safe.* 🔒
