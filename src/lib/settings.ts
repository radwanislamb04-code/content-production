/**
 * Content OS — dashboard-managed settings.
 *
 * Every key the user enters in Settings → API Keys is written to Cloudflare KV
 * by /api/settings and read from KV by the routes that need it. Nothing here
 * requires `wrangler secret put` or a redeploy: KV is durable storage, so a
 * value saved once survives worker restarts, redeploys and rollbacks.
 *
 * Resolution order for every setting is always:
 *   1. KV        (`settings:*` key written from the dashboard)
 *   2. Worker env var (legacy / bootstrap escape hatch)
 *   3. null
 *
 * The env fallback exists so an already-provisioned Worker keeps working during
 * the migration; once a value is saved in the dashboard, KV wins.
 */

/* -------------------------------------------------------------------------- */
/* KV key registry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Single source of truth for setting key names. Only add a key here — never
 * inline a string literal in a route, or the Settings UI and the consumer will
 * silently disagree (that is exactly how the Telegram keys drifted apart).
 */
export const SETTINGS_KEYS = {
  // AI Brain — Anthropic-compatible endpoint used by every AI route.
  aiBaseUrl: "settings:ai:base-url",
  aiKey: "settings:ai:key",

  // Data sources.
  youtube: "settings:data:youtube",
  serpapi: "settings:data:serpapi",
  redditId: "settings:data:reddit-id",
  redditSecret: "settings:data:reddit-secret",
  producthunt: "settings:data:producthunt",

  // Apify scraper slots (JSON array — see ApifySlot).
  apifySlots: "settings:apify:slots",

  // Notifications.
  telegramBotToken: "settings:telegram:bot-token",
  telegramChatId: "settings:telegram:chat-id",

  // Instagram (used by the competitor check).
  instagramHandle: "settings:instagram:handle",
  instagramCompetitors: "settings:instagram:competitors",

  // Content strategy — drives the planner and the brief.
  contentPillars: "settings:content:pillars",
  contentPostingTimes: "settings:content:posting-times",

  // Image generation — already live before this module existed.
  imagegenKey: "settings:imagegen:vyceai",
  imagegenModel: "settings:imagegen:default-model",
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/**
 * Key names an earlier build wrote directly. Kept as read-only aliases so the
 * Telegram cron does not break for anyone who already stored them by hand.
 */
export const LEGACY_KEYS = {
  telegramBotToken: "telegram_bot_token",
  telegramChatId: "telegram_chat_id",
} as const;

/** Env-var names used as the KV-miss fallback, per setting. */
export const SETTINGS_ENV_VARS: Record<string, string> = {
  [SETTINGS_KEYS.aiBaseUrl]: "ANTHROPIC_BASE_URL",
  [SETTINGS_KEYS.aiKey]: "ANTHROPIC_API_KEY",
  [SETTINGS_KEYS.youtube]: "YOUTUBE_API_KEY",
  [SETTINGS_KEYS.serpapi]: "SERPAPI_KEY",
  [SETTINGS_KEYS.redditId]: "REDDIT_CLIENT_ID",
  [SETTINGS_KEYS.redditSecret]: "REDDIT_CLIENT_SECRET",
  [SETTINGS_KEYS.producthunt]: "PRODUCTHUNT_TOKEN",
  [SETTINGS_KEYS.apifySlots]: "APIFY_API_TOKEN",
  [SETTINGS_KEYS.telegramBotToken]: "TELEGRAM_BOT_TOKEN",
  [SETTINGS_KEYS.telegramChatId]: "TELEGRAM_CHAT_ID",
  [SETTINGS_KEYS.instagramHandle]: "INSTAGRAM_HANDLE",
  [SETTINGS_KEYS.imagegenKey]: "VYCEAI_API_KEY",
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** One Apify credential slot, as rendered on Settings → API Keys → Apify. */
export type ApifySlot = {
  id: number;
  label: string;
  job: string;
  token: string;
  /** Monthly spend cap in USD, used by the progress bar only. */
  cap: number;
};

/** Shape returned to the browser — never contains a full secret. */
export type MaskedSetting = {
  configured: boolean;
  last4: string | null;
};

/* -------------------------------------------------------------------------- */
/* Env + KV access                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the Cloudflare env object from either the request runtime (Nitro
 * injects it there) or the TanStack Start server context.
 */
export function getEnv(request: unknown, context: unknown): any {
  return (
    (request as any)?.runtime?.cloudflare?.env ??
    (context as any)?.cloudflare?.env ??
    null
  );
}

export function getKv(env: any): any | null {
  return env?.KV ?? null;
}

export function getDb(env: any): any | null {
  return env?.DB ?? null;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Read one setting: KV first, then the matching env var, then null.
 * Never throws — a missing KV binding or a transient KV error degrades to the
 * env fallback rather than failing the caller's request.
 */
export async function readSetting(
  env: any,
  key: SettingKey | string,
  envVarName?: string,
): Promise<string | null> {
  const kv = getKv(env);
  if (kv) {
    try {
      const value = await kv.get(key);
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    } catch {
      /* fall through to env */
    }
  }

  const name = envVarName ?? SETTINGS_ENV_VARS[key];
  if (name) {
    const fromEnv = env?.[name];
    if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
      return fromEnv.trim();
    }
  }

  return null;
}

/** Read a JSON-valued setting (e.g. the Apify slot array). */
export async function readJsonSetting<T>(
  env: any,
  key: SettingKey | string,
  fallback: T,
): Promise<T> {
  const raw = await readSetting(env, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Telegram credentials shared by the /api/telegram-cron route and the scheduled
 * dispatcher. Reads the new names first, then the legacy names, then env.
 */
export async function readTelegramConfig(
  env: any,
): Promise<{ botToken: string | null; chatId: string | null }> {
  const kv = getKv(env);
  const read = async (primary: string, legacy: string) => {
    const value = await readSetting(env, primary);
    if (value) return value;
    if (kv) {
      try {
        const old = await kv.get(legacy);
        if (typeof old === "string" && old.trim() !== "") return old.trim();
      } catch {
        /* ignore */
      }
    }
    return null;
  };

  const botToken = await read(
    SETTINGS_KEYS.telegramBotToken,
    LEGACY_KEYS.telegramBotToken,
  );
  const chatId = await read(
    SETTINGS_KEYS.telegramChatId,
    LEGACY_KEYS.telegramChatId,
  );
  return { botToken, chatId };
}

/** The AI endpoint every AI route talks to, plus whether it is configured. */
export async function readAiConfig(
  env: any,
): Promise<{ baseUrl: string | null; apiKey: string | null }> {
  const [baseUrl, apiKey] = await Promise.all([
    readSetting(env, SETTINGS_KEYS.aiBaseUrl),
    readSetting(env, SETTINGS_KEYS.aiKey),
  ]);
  return { baseUrl, apiKey };
}

/**
 * Build the chat endpoint from whatever the user pasted as the AI base URL.
 * Anthropic and Anthropic-compatible gateways (including manifest.build) serve
 * `POST /v1/messages`, but people paste all sorts of things — with or without a
 * trailing slash, with or without the version segment, occasionally the whole
 * path. Normalise so a missing `/v1` can never cause a mystery 404:
 *   https://app.manifest.build        -> https://app.manifest.build/v1/messages
 *   https://app.manifest.build/       -> https://app.manifest.build/v1/messages
 *   https://app.manifest.build/v1     -> https://app.manifest.build/v1/messages
 *   https://api.anthropic.com/v1/messages -> unchanged
 */
export function anthropicMessagesUrl(baseUrl: string): string {
  const base = String(baseUrl).trim().replace(/\/+$/, "");
  if (/\/messages$/.test(base)) return base;
  if (/\/v\d+(beta)?$/i.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

// ------------------------------------------------------- content strategy

/** Rotated by the planner when the user has not set their own. */
export const DEFAULT_PILLARS = ["AI tips", "productivity", "behind the scenes"];

export async function readPillars(env: any): Promise<string[]> {
  const raw = await readJsonSetting<string[]>(
    env,
    SETTINGS_KEYS.contentPillars,
    [],
  );
  const clean = (Array.isArray(raw) ? raw : [])
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  return clean.length ? clean : DEFAULT_PILLARS;
}

/** Posting cadence in Asia/Dhaka — Reels 9 PM, Stories 12 PM, Carousels 6 PM. */
export const DEFAULT_POSTING_TIMES = {
  reel: "21:00",
  story: "12:00",
  carousel: "18:00",
};

export type PostingTimes = typeof DEFAULT_POSTING_TIMES;

export async function readPostingTimes(env: any): Promise<PostingTimes> {
  const raw = await readJsonSetting<Partial<PostingTimes>>(
    env,
    SETTINGS_KEYS.contentPostingTimes,
    {},
  );
  const pick = (value: unknown, fallback: string) =>
    /^\d{2}:\d{2}$/.test(String(value ?? "")) ? String(value) : fallback;
  return {
    reel: pick(raw?.reel, DEFAULT_POSTING_TIMES.reel),
    story: pick(raw?.story, DEFAULT_POSTING_TIMES.story),
    carousel: pick(raw?.carousel, DEFAULT_POSTING_TIMES.carousel),
  };
}

/**
 * The Apify token to use for a given job. Slots live in one JSON setting, each
 * with its own token; pick the slot assigned to `job`, else the first slot that
 * actually has a token, else the single APIFY_API_TOKEN env fallback.
 */
export async function readApifyToken(
  env: any,
  job?: string,
): Promise<string | null> {
  const stored = await readJsonSetting<ApifySlot[]>(
    env,
    SETTINGS_KEYS.apifySlots,
    [],
  );
  const usable = stored.filter((s) => typeof s?.token === "string" && s.token.trim());
  const forJob = job ? usable.find((s) => s.job === job) : undefined;
  const chosen = forJob ?? usable[0];
  if (chosen) return chosen.token.trim();
  return readSetting(env, SETTINGS_KEYS.apifySlots);
}

/* -------------------------------------------------------------------------- */
/* Writes + masking                                                           */
/* -------------------------------------------------------------------------- */

/** Write one setting. Empty string / undefined clears it. */
export async function writeSetting(
  env: any,
  key: SettingKey | string,
  value: string | null | undefined,
): Promise<void> {
  const kv = getKv(env);
  if (!kv) throw new Error("KV namespace is not bound.");
  if (value === null || value === undefined || value.trim() === "") {
    await kv.delete(key);
    return;
  }
  await kv.put(key, value.trim());
}

/** Bulk write, used by the POST handler. */
export async function writeSettings(
  env: any,
  entries: Record<string, string | null | undefined>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await writeSetting(env, key, value);
  }
}

export function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return value;
  return value.slice(-4);
}

/** Masked view of a stored secret: `{configured, last4}`. */
export function mask(value: string | null | undefined): MaskedSetting {
  return { configured: !!value, last4: maskLast4(value) };
}

/**
 * Masked view of the Apify slots. Tokens are replaced by their last 4 chars so
 * the browser can confirm a credential is stored without receiving it back.
 */
export function maskApifySlots(slots: ApifySlot[]): Array<
  Omit<ApifySlot, "token"> & MaskedSetting
> {
  return slots.map(({ token, ...rest }) => ({
    ...rest,
    ...mask(token),
  }));
}
