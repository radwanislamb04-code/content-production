/**
 * Content OS — connected channels (M1).
 *
 * "Connect Instagram" like any other tool, but running on the owner's own
 * Cloudflare account: the user clicks once, Instagram asks for permission, and the
 * token lands here — encrypted — never in a config file.
 *
 * The parts that matter:
 *   1. `state` is HMAC-signed, so a callback cannot be forged or replayed for a
 *      different user (CSRF).
 *   2. The long-lived token (60 days) is encrypted with AES-GCM keyed off the app
 *      secret; the table alone is useless if it leaks.
 *   3. Refresh is a plain API call, so the cron does it forever — the user does
 *      nothing (see the zero-manual section of the connect plan).
 */

import { readSetting, SETTINGS_KEYS, writeSetting } from "./settings";
import { subscribeFields, subscribedApps } from "./instagram-api";

export const IG_PLATFORM = "instagram";

/** Instagram API with Instagram Login — no Facebook Page needed. */
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_TOKEN_URL = "https://graph.instagram.com/access_token";
const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";
export const GRAPH = "https://graph.instagram.com";

/** 60 days, minus a day of slack so a refresh is never a race with expiry. */
export const TOKEN_LIFETIME_MS = 59 * 86_400_000;
/** Only refresh when it is worth a call — twice a week is plenty. */
const REFRESH_AFTER_MS = 3 * 86_400_000;

export type Channel = {
  id: string;
  user_id: string;
  platform: string;
  ig_user_id: string | null;
  username: string | null;
  account_type: string | null;
  token_enc: string | null;
  token_expires_at: number | null;
  token_refreshed_at: number | null;
  scopes: string | null;
  status: string;
  last_event_at: number | null;
  last_error: string | null;
  connected_at: number;
  updated_at: number;
};

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/instagram-oauth?action=callback`;
}

/* --------------------------------------------------------------- app creds */

export type AppCreds = { appId: string; appSecret: string; verifyToken: string };

/**
 * App-level, so it is read as the OWNER regardless of who is asking: one app
 * serves every connected account, and a second user must not need their own copy.
 */
export async function appCreds(env: any): Promise<AppCreds | null> {
  const [appId, appSecret, verifyToken] = await Promise.all([
    readSetting(env, SETTINGS_KEYS.instagramAppId),
    readSetting(env, SETTINGS_KEYS.instagramAppSecret),
    readSetting(env, SETTINGS_KEYS.instagramVerifyToken),
  ]);
  if (!appId || !appSecret) return null;
  return { appId, appSecret, verifyToken: verifyToken ?? "" };
}

/**
 * The webhook handshake needs a token Meta and we both know. Rather than making
 * the owner invent one, we generate it and show it in the Connections card ready
 * to paste — one less field to get wrong.
 */
export async function ensureVerifyToken(env: any): Promise<string> {
  const existing = await readSetting(env, SETTINGS_KEYS.instagramVerifyToken);
  if (existing) return existing;
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = `cos_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  await writeSetting(env, SETTINGS_KEYS.instagramVerifyToken, token);
  return token;
}

export async function saveAppCreds(
  env: any,
  creds: { appId?: string | null; appSecret?: string | null; verifyToken?: string | null },
): Promise<void> {
  await writeSetting(env, SETTINGS_KEYS.instagramAppId, creds.appId ?? undefined);
  await writeSetting(env, SETTINGS_KEYS.instagramAppSecret, creds.appSecret ?? undefined);
  if (creds.verifyToken !== undefined) {
    await writeSetting(env, SETTINGS_KEYS.instagramVerifyToken, creds.verifyToken ?? undefined);
  }
}

/* ------------------------------------------------------------------ crypto */

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Backed by an explicit ArrayBuffer: WebCrypto's BufferSource will not accept a
// Uint8Array that might be sitting on a SharedArrayBuffer.
function unb64(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function aesKey(appSecret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("content-os:channels:v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** `v1.<iv>.<ciphertext>` — nothing readable, nothing reusable without the secret. */
export async function encryptToken(env: any, token: string): Promise<string | null> {
  const creds = await appCreds(env);
  if (!creds) return null;
  try {
    const key = await aesKey(creds.appSecret);
    const iv = new Uint8Array(new ArrayBuffer(12));
    crypto.getRandomValues(iv);
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(token),
    );
    return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
  } catch {
    return null;
  }
}

export async function decryptToken(env: any, stored: string | null): Promise<string | null> {
  if (!stored) return null;
  const creds = await appCreds(env);
  if (!creds) return null;
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const key = await aesKey(creds.appSecret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(parts[1]) },
      key,
      unb64(parts[2]),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- state */

/** A short-lived signed state: the callback cannot be forged or replayed. */
export async function signState(env: any, userId: string): Promise<string | null> {
  const creds = await appCreds(env);
  if (!creds) return null;
  const payload = `${userId}.${Date.now()}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(creds.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${b64(new TextEncoder().encode(payload))}.${b64(new Uint8Array(mac))}`;
}

export async function verifyState(
  env: any,
  state: string,
): Promise<{ userId: string } | null> {
  const creds = await appCreds(env);
  if (!creds) return null;
  const [payloadPart, macPart] = String(state ?? "").split(".");
  if (!payloadPart || !macPart) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(creds.appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      unb64(macPart),
      new TextEncoder().encode(new TextDecoder().decode(unb64(payloadPart))),
    );
    if (!ok) return null;
    const payload = new TextDecoder().decode(unb64(payloadPart));
    const [userId, ts] = payload.split(".");
    // 15 minutes is long enough for a login, short enough to be useless later.
    if (!userId || !ts || Date.now() - Number(ts) > 15 * 60_000) return null;
    return { userId };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- oauth */

export function authUrl(creds: AppCreds, origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type Exchange = {
  ok: boolean;
  token?: string;
  expiresIn?: number;
  igUserId?: string;
  error?: string;
};

/** code → short-lived token (1 hour). */
export async function exchangeCode(
  creds: AppCreds,
  code: string,
  origin: string,
): Promise<Exchange> {
  try {
    const body = new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
      code,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      return {
        ok: false,
        error: json?.error_message ?? json?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      token: json.access_token,
      expiresIn: Number(json.expires_in ?? 3600),
      igUserId: json.user_id ? String(json.user_id) : undefined,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** Short-lived → long-lived (~60 days). */
export async function longLivedToken(
  creds: AppCreds,
  shortToken: string,
): Promise<Exchange> {
  try {
    const url = `${LONG_TOKEN_URL}?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      creds.appSecret,
    )}&access_token=${encodeURIComponent(shortToken)}`;
    const res = await fetch(url);
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      return {
        ok: false,
        error: json?.error_message ?? json?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, token: json.access_token, expiresIn: Number(json.expires_in ?? 5_184_000) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * The call the daily cron makes. Meta allows it once the token is 24 hours old and
 * only before it expires; a successful refresh resets the clock to 60 days.
 */
export async function refreshLongLived(token: string): Promise<Exchange> {
  try {
    const url = `${REFRESH_URL}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      return {
        ok: false,
        error: json?.error_message ?? json?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, token: json.access_token, expiresIn: Number(json.expires_in ?? 5_184_000) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function fetchMe(
  token: string,
): Promise<{ ok: boolean; igUserId?: string; username?: string; accountType?: string; error?: string }> {
  try {
    const url = `${GRAPH}/v21.0/me?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.id) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      igUserId: String(json.id),
      username: json.username ?? null,
      accountType: json.account_type ?? null,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/* ---------------------------------------------------------------- registry */

export async function listChannels(env: any, userId: string): Promise<Channel[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM channels WHERE user_id = ? AND platform = ? ORDER BY connected_at DESC",
    )
      .bind(userId, IG_PLATFORM)
      .all();
    return (results ?? []) as Channel[];
  } catch {
    return [];
  }
}

export async function getChannel(
  env: any,
  userId: string,
  id?: string,
): Promise<Channel | null> {
  try {
    const row = id
      ? await env.DB.prepare(
          "SELECT * FROM channels WHERE id = ? AND user_id = ? AND platform = ?",
        )
          .bind(id, userId, IG_PLATFORM)
          .first()
      : await env.DB.prepare(
          "SELECT * FROM channels WHERE user_id = ? AND platform = ? ORDER BY connected_at DESC LIMIT 1",
        )
          .bind(userId, IG_PLATFORM)
          .first();
    return (row as Channel) ?? null;
  } catch {
    return null;
  }
}

/** Which user owns this Instagram account? A webhook has no other identity. */
export async function channelForIgId(env: any, igUserId: string): Promise<Channel | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM channels WHERE platform = ? AND ig_user_id = ? LIMIT 1",
    )
      .bind(IG_PLATFORM, String(igUserId))
      .first();
    return (row as Channel) ?? null;
  } catch {
    return null;
  }
}

export async function saveChannel(
  env: any,
  userId: string,
  data: {
    igUserId: string;
    username: string | null;
    accountType: string | null;
    token: string;
    expiresIn: number;
    scopes?: string[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const encrypted = await encryptToken(env, data.token);
  if (!encrypted) {
    return {
      ok: false,
      error:
        "Could not encrypt the token — the app secret is missing, so there is nothing to encrypt with.",
    };
  }
  const now = Date.now();
  const expiresAt = now + Math.round(data.expiresIn * 1000);
  const scopes = (data.scopes ?? IG_SCOPES).join(",");
  try {
    const existing = await channelForIgId(env, data.igUserId);
    if (existing) {
      // Reconnecting an account the app already knows: update in place, and make
      // sure it belongs to whoever just authorised it.
      await env.DB.prepare(
        `UPDATE channels SET user_id = ?, username = ?, account_type = ?, token_enc = ?,
           token_expires_at = ?, token_refreshed_at = ?, scopes = ?, status = 'connected',
           last_error = NULL, connected_at = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(
          userId,
          data.username,
          data.accountType,
          encrypted,
          expiresAt,
          now,
          scopes,
          now,
          now,
          existing.id,
        )
        .run();
      return { ok: true };
    }
    await env.DB.prepare(
      `INSERT INTO channels
         (id, user_id, platform, ig_user_id, username, account_type, token_enc,
          token_expires_at, token_refreshed_at, scopes, status, connected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        IG_PLATFORM,
        data.igUserId,
        data.username,
        data.accountType,
        encrypted,
        expiresAt,
        now,
        scopes,
        now,
        now,
      )
      .run();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function disconnectChannel(env: any, userId: string, id: string): Promise<boolean> {
  try {
    // The token goes with the row: disconnecting must actually disconnect.
    const res = await env.DB.prepare(
      "DELETE FROM channels WHERE id = ? AND user_id = ? AND platform = ?",
    )
      .bind(id, userId, IG_PLATFORM)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Bookkeeping for a channel.
 *
 * Every bound value is a real value: D1 throws on `undefined` ("Type 'undefined'
 * not supported"), and because the whole call sits in a catch, the update would
 * have failed silently — which is exactly how `last_event_at` would have stopped
 * being recorded without anybody noticing.
 */
export async function markChannel(
  env: any,
  id: string,
  patch: { status?: string; error?: string | null; lastEventAt?: number },
): Promise<void> {
  const touchesError = patch.error !== undefined;
  try {
    await env.DB.prepare(
      `UPDATE channels SET
         status = COALESCE(?, status),
         last_error = CASE WHEN ? = 1 THEN ? ELSE last_error END,
         last_event_at = COALESCE(?, last_event_at),
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        patch.status ?? null,
        touchesError ? 1 : 0,
        patch.error ?? null,
        patch.lastEventAt ?? null,
        Date.now(),
        id,
      )
      .run();
  } catch {
    /* bookkeeping only */
  }
}

/* -------------------------------------------------------------- maintenance */

export const WEBHOOK_FIELDS = ["comments", "messages", "message_reactions"];

export type HealOutcome = {
  checked: number;
  fixed: number;
  details: Array<{ channel: string; action: string; detail?: string }>;
};

/**
 * Self-healing: a webhook subscription can be lost (a Meta-side change, a revoked
 * permission, a failed connect). Instead of waiting for the owner to notice that
 * nothing arrives, every cron run compares what Meta has with what we need and
 * puts it back.
 */
export async function ensureSubscriptions(env: any): Promise<HealOutcome> {
  const outcome: HealOutcome = { checked: 0, fixed: 0, details: [] };
  let channels: Channel[] = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM channels WHERE platform = ? AND status != 'paused'",
    )
      .bind(IG_PLATFORM)
      .all();
    channels = (results ?? []) as Channel[];
  } catch {
    return outcome;
  }

  for (const channel of channels) {
    outcome.checked++;
    const label = channel.username ? `@${channel.username}` : (channel.ig_user_id ?? channel.id);
    const token = await decryptToken(env, channel.token_enc);
    if (!token || !channel.ig_user_id) {
      outcome.details.push({ channel: label, action: "skipped", detail: "no usable token" });
      continue;
    }

    const current = await subscribedApps(token, channel.ig_user_id);
    if (!current.ok) {
      outcome.details.push({ channel: label, action: "unreadable", detail: current.error });
      continue;
    }

    const subscribed: string[] = Array.isArray(current.data)
      ? current.data.flatMap((app: any) => app?.subscribed_fields ?? [])
      : [];
    const missing = WEBHOOK_FIELDS.filter((f) => !subscribed.includes(f));
    if (missing.length === 0) {
      outcome.details.push({ channel: label, action: "ok" });
      continue;
    }

    const fixed = await subscribeFields(token, channel.ig_user_id, WEBHOOK_FIELDS);
    if (fixed.ok) {
      outcome.fixed++;
      outcome.details.push({
        channel: label,
        action: "resubscribed",
        detail: `was missing ${missing.join(", ")}`,
      });
    } else {
      outcome.details.push({ channel: label, action: "failed", detail: fixed.error });
    }
  }

  return outcome;
}

/**
 * The spam guard. Meta throttles an app that fires too fast, and a viral reel can
 * produce a burst of comments in seconds — so the webhook counts what this user has
 * already sent in the last minute and stops rather than getting the app limited.
 * A skipped event is recorded and becomes a hand-off, never silent.
 */
export const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT_PER_MINUTE = 20;

export async function recentSendCount(env: any, userId: string): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM dm_messages
        WHERE user_id = ? AND direction = 'out' AND status = 'sent' AND created_at >= ?`,
    )
      .bind(userId, Date.now() - RATE_WINDOW_MS)
      .first();
    return Number((row as any)?.n ?? 0);
  } catch {
    return 0;
  }
}

export type RefreshOutcome = {
  checked: number;
  refreshed: number;
  failed: number;
  details: Array<{ channel: string; action: string; detail?: string }>;
};

/**
 * The zero-manual half: refresh every token that is old enough to be worth a call
 * but not yet expired. Runs from the cron; also exposed so it can be pressed by
 * hand (and so it can be tested).
 */
export async function refreshDueChannels(
  env: any,
  opts: { force?: boolean } = {},
): Promise<RefreshOutcome> {
  const outcome: RefreshOutcome = { checked: 0, refreshed: 0, failed: 0, details: [] };
  let channels: Channel[] = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM channels WHERE platform = ? AND status = 'connected'",
    )
      .bind(IG_PLATFORM)
      .all();
    channels = (results ?? []) as Channel[];
  } catch {
    return outcome;
  }

  const now = Date.now();
  for (const channel of channels) {
    outcome.checked++;
    const label = channel.username ? `@${channel.username}` : channel.ig_user_id ?? channel.id;
    const refreshedAt = channel.token_refreshed_at ?? channel.connected_at;

    if (channel.token_expires_at && now > channel.token_expires_at) {
      // Past expiry: Meta will not refresh it any more. Say so instead of retrying.
      outcome.failed++;
      outcome.details.push({ channel: label, action: "expired", detail: "needs a reconnect" });
      await markChannel(env, channel.id, {
        status: "needs_reconnect",
        error: "The access token expired — connect the account again.",
      });
      continue;
    }
    if (!opts.force && now - refreshedAt < REFRESH_AFTER_MS) {
      outcome.details.push({ channel: label, action: "skipped", detail: "refreshed recently" });
      continue;
    }

    const token = await decryptToken(env, channel.token_enc);
    if (!token) {
      outcome.failed++;
      outcome.details.push({
        channel: label,
        action: "undecryptable",
        detail: "the app secret changed — reconnect",
      });
      await markChannel(env, channel.id, {
        status: "needs_reconnect",
        error: "Stored token could not be decrypted (app secret changed?).",
      });
      continue;
    }

    const result = await refreshLongLived(token);
    if (!result.ok || !result.token) {
      outcome.failed++;
      outcome.details.push({ channel: label, action: "failed", detail: result.error });
      await markChannel(env, channel.id, {
        status: "needs_reconnect",
        error: result.error ?? "refresh failed",
      });
      continue;
    }

    const encrypted = await encryptToken(env, result.token);
    try {
      await env.DB.prepare(
        `UPDATE channels SET token_enc = ?, token_expires_at = ?, token_refreshed_at = ?,
           status = 'connected', last_error = NULL, updated_at = ? WHERE id = ?`,
      )
        .bind(
          encrypted,
          now + Math.round((result.expiresIn ?? 5_184_000) * 1000),
          now,
          now,
          channel.id,
        )
        .run();
    } catch {
      /* the next run will try again */
    }
    outcome.refreshed++;
    outcome.details.push({ channel: label, action: "refreshed" });
  }

  return outcome;
}
