/**
 * Content OS — the Telegram intake (the other direction).
 *
 * Until now Telegram was outbound only: the cron and `/api/telegram-cron` push
 * briefs to the chat configured in Settings. This module is the inbound half —
 * a message you send to your own bot becomes a real task in `telegram_tasks`,
 * and the bot answers with a receipt.
 *
 * Per user, because every profile has its own bot:
 *   telegram_webhook — one row per user: the secret Telegram must present, the
 *                      bot's @username, when the hook was registered and the last
 *                      error the Bot API reported (so the Settings card can say
 *                      WHY nothing arrives instead of guessing).
 *   telegram_updates — every `update_id` already handled. Telegram re-sends an
 *                      update until it receives a 2xx, so without this one
 *                      message could become three tasks.
 *
 * The route (`/api/telegram-hook`) stays a thin transport layer; everything
 * worth testing lives here.
 */

import { SETTINGS_KEYS, readTelegramConfig, writeSetting } from "./settings";
import { sendTelegramTo, type TelegramResult } from "./telegram";
import { logActivity } from "./activity";

export type WebhookRow = {
  user_id: string;
  secret: string;
  bot_username: string | null;
  chat_id: string | null;
  registered_at: number | null;
  last_update_at: number | null;
  last_error: string | null;
  updates_seen: number | null;
};

export type TaskInput = {
  text: string;
  time?: string;
  due_date?: string | null;
  source?: "manual" | "telegram" | "calendar" | "library";
  /** Stable key for auto-queued rows — a second queue of the same source is a no-op. */
  ref_key?: string | null;
};

/* ------------------------------------------------------------------ helpers */

/** HH:MM in Asia/Dhaka — the timezone every schedule in this app uses. */
export function dhakaTime(at: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(at));
}

/** YYYY-MM-DD in Asia/Dhaka. */
export function dhakaDate(at: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
  return parts;
}

/** 48 hex chars. Long enough that guessing it is pointless, short enough for a URL. */
export function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function webhookUrl(origin: string, secret: string): string {
  return `${origin.replace(/\/+$/, "")}/api/telegram-hook?s=${secret}`;
}

/* ------------------------------------------------------------------ registry */

export async function getWebhook(env: any, userId: string): Promise<WebhookRow | null> {
  const db = env?.DB;
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT * FROM telegram_webhook WHERE user_id = ?")
      .bind(userId)
      .first();
    return (row as WebhookRow) ?? null;
  } catch {
    return null;
  }
}

/** Which user a presented secret belongs to. An unknown secret matches nothing. */
export async function findWebhookBySecret(
  env: any,
  secret: string,
): Promise<WebhookRow | null> {
  const db = env?.DB;
  if (!db || !secret) return null;
  try {
    const row = await db
      .prepare("SELECT * FROM telegram_webhook WHERE secret = ?")
      .bind(secret)
      .first();
    return (row as WebhookRow) ?? null;
  } catch {
    return null;
  }
}

async function saveWebhook(env: any, row: WebhookRow): Promise<boolean> {
  const db = env?.DB;
  if (!db) return false;
  try {
    await db
      .prepare(
        `INSERT INTO telegram_webhook
           (user_id, secret, bot_username, chat_id, registered_at, last_update_at, last_error, updates_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           secret = excluded.secret,
           bot_username = excluded.bot_username,
           chat_id = excluded.chat_id,
           registered_at = excluded.registered_at,
           last_update_at = excluded.last_update_at,
           last_error = excluded.last_error,
           updates_seen = excluded.updates_seen`,
      )
      .bind(
        row.user_id,
        row.secret,
        row.bot_username,
        row.chat_id,
        row.registered_at,
        row.last_update_at,
        row.last_error,
        row.updates_seen ?? 0,
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

/** The user's row, created on first use. `reset` issues a brand-new secret. */
export async function ensureWebhook(
  env: any,
  userId: string,
  opts: { reset?: boolean } = {},
): Promise<WebhookRow> {
  const existing = await getWebhook(env, userId);
  if (existing && !opts.reset) return existing;
  const row: WebhookRow = {
    user_id: userId,
    secret: randomSecret(),
    bot_username: existing?.bot_username ?? null,
    chat_id: existing?.chat_id ?? null,
    registered_at: null,
    last_update_at: existing?.last_update_at ?? null,
    last_error: null,
    updates_seen: existing?.updates_seen ?? 0,
  };
  await saveWebhook(env, row);
  return row;
}

/** Remember the chat that last wrote to the bot — used to prefill Settings. */
export async function rememberChat(
  env: any,
  row: WebhookRow,
  chatId: string | number,
): Promise<void> {
  const id = String(chatId);
  if (row.chat_id === id) return;
  await saveWebhook(env, { ...row, chat_id: id });
}

export async function markUpdate(
  env: any,
  userId: string,
  patch: { error?: string | null },
): Promise<void> {
  const row = await getWebhook(env, userId);
  if (!row) return;
  await saveWebhook(env, {
    ...row,
    last_update_at: Date.now(),
    last_error: patch.error === undefined ? row.last_error : patch.error,
    updates_seen: (row.updates_seen ?? 0) + 1,
  });
}

/**
 * Claim an update id. Returns false when this update was already handled, which
 * is what makes a Telegram retry harmless.
 */
export async function claimUpdate(
  env: any,
  updateId: number,
  userId: string,
): Promise<boolean> {
  const db = env?.DB;
  if (!db) return true;
  try {
    const res = await db
      .prepare(
        "INSERT OR IGNORE INTO telegram_updates (update_id, user_id, received_at) VALUES (?, ?, ?)",
      )
      .bind(updateId, userId, Date.now())
      .run();
    const changes = Number(res?.meta?.changes ?? 1);
    return changes > 0;
  } catch {
    // Never drop a message because the bookkeeping table is unhappy.
    return true;
  }
}

/* ------------------------------------------------------------------ the Bot API */

type BotInfo = { ok: boolean; username?: string; error?: string };

export async function botInfo(botToken: string): Promise<BotInfo> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `Telegram returned HTTP ${res.status}` };
    }
    return { ok: true, username: data?.result?.username ?? null };
  } catch (err: any) {
    return { ok: false, error: `Telegram request failed: ${err?.message ?? String(err)}` };
  }
}

export async function webhookInfo(
  botToken: string,
): Promise<{ ok: boolean; error?: string; info?: any }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `Telegram returned HTTP ${res.status}` };
    }
    return { ok: true, info: data?.result ?? null };
  } catch (err: any) {
    return { ok: false, error: `Telegram request failed: ${err?.message ?? String(err)}` };
  }
}

export type WebhookStatus = {
  configured: boolean;
  hasToken: boolean;
  botUsername: string | null;
  url: string | null;
  registeredAt: number | null;
  lastUpdateAt: number | null;
  updatesSeen: number;
  lastError: string | null;
  /** Straight from Telegram, so a broken hook can be explained rather than guessed. */
  telegram?: {
    url: string | null;
    pendingUpdates: number;
    lastErrorDate: number | null;
    lastErrorMessage: string | null;
  } | null;
  error?: string;
};

export async function webhookStatus(
  env: any,
  userId: string,
  origin: string,
  opts: { createIfMissing?: boolean } = {},
): Promise<WebhookStatus> {
  const { botToken } = await readTelegramConfig(env, userId);
  const row = opts.createIfMissing
    ? await ensureWebhook(env, userId)
    : await getWebhook(env, userId);

  if (!row) {
    return {
      configured: false,
      hasToken: !!botToken,
      botUsername: null,
      url: null,
      registeredAt: null,
      lastUpdateAt: null,
      updatesSeen: 0,
      lastError: null,
      telegram: null,
    };
  }

  const base: WebhookStatus = {
    configured: true,
    hasToken: !!botToken,
    botUsername: row.bot_username,
    url: webhookUrl(origin, row.secret),
    registeredAt: row.registered_at,
    lastUpdateAt: row.last_update_at,
    updatesSeen: row.updates_seen ?? 0,
    lastError: row.last_error,
    telegram: null,
  };

  if (!botToken) return base;

  const info = await webhookInfo(botToken);
  if (!info.ok) return { ...base, error: info.error };
  return {
    ...base,
    telegram: {
      url: info.info?.url ?? null,
      pendingUpdates: Number(info.info?.pending_update_count ?? 0),
      lastErrorDate: info.info?.last_error_date ?? null,
      lastErrorMessage: info.info?.last_error_message ?? null,
    },
  };
}

/**
 * Point the user's bot at this Worker. Telegram echoes our secret back on every
 * delivery, so the route can tell which profile an update belongs to without any
 * extra identity in the URL.
 */
export async function registerWebhook(
  env: any,
  userId: string,
  origin: string,
): Promise<{ ok: boolean; error?: string; url?: string; username?: string | null }> {
  const { botToken } = await readTelegramConfig(env, userId);
  if (!botToken) {
    return {
      ok: false,
      error:
        "Save your Telegram bot token first — the bot is what Telegram delivers to.",
    };
  }

  const row = await ensureWebhook(env, userId);
  const url = webhookUrl(origin, row.secret);
  const me = await botInfo(botToken);
  if (!me.ok) {
    await saveWebhook(env, { ...row, last_error: me.error ?? "getMe failed" });
    return { ok: false, error: me.error ?? "The bot token was rejected by Telegram." };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: row.secret,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false,
      }),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const error = data?.description ?? `Telegram returned HTTP ${res.status}`;
      await saveWebhook(env, { ...row, last_error: error });
      return { ok: false, error };
    }
  } catch (err: any) {
    const error = `Telegram request failed: ${err?.message ?? String(err)}`;
    await saveWebhook(env, { ...row, last_error: error });
    return { ok: false, error };
  }

  const info = await webhookInfo(botToken);
  const lastError = info.ok ? (info.info?.last_error_message ?? null) : (info.error ?? null);
  await saveWebhook(env, {
    ...row,
    bot_username: me.username ?? row.bot_username,
    registered_at: Date.now(),
    last_error: lastError,
  });

  await logActivity(env, "telegram-hook", "registered", `webhook set for @${me.username ?? "bot"}`, userId);
  return { ok: true, url, username: me.username ?? null };
}

export async function removeWebhook(
  env: any,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { botToken } = await readTelegramConfig(env, userId);
  if (!botToken) return { ok: false, error: "No bot token stored." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "" }),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `Telegram returned HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { ok: false, error: `Telegram request failed: ${err?.message ?? String(err)}` };
  }
  const row = await getWebhook(env, userId);
  if (row) await saveWebhook(env, { ...row, registered_at: null, last_error: null });
  await logActivity(env, "telegram-hook", "removed", "webhook removed", userId);
  return { ok: true };
}

/* ------------------------------------------------------------------ tasks */

/**
 * Write one task. With a `ref_key` the insert is ignored when that key was
 * already queued, so re-running the auto-queue never duplicates work.
 */
export async function createTask(
  env: any,
  userId: string,
  input: TaskInput,
): Promise<{ created: boolean; id: string | null; error?: string }> {
  const db = env?.DB;
  if (!db) return { created: false, id: null, error: "No database binding available." };

  const text = String(input.text ?? "").trim().slice(0, 300);
  if (!text) return { created: false, id: null, error: "Empty task text." };

  const id = crypto.randomUUID();
  const time = input.time && /^\d{2}:\d{2}$/.test(input.time) ? input.time : dhakaTime();
  const refKey = input.ref_key ? String(input.ref_key).slice(0, 200) : null;

  try {
    const stmt = refKey
      ? db
          .prepare(
            "INSERT OR IGNORE INTO telegram_tasks (id, text, time, done, created_at, user_id, source, due_date, ref_key) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            text,
            time,
            Date.now(),
            userId,
            input.source ?? "manual",
            input.due_date ?? null,
            refKey,
          )
      : db
          .prepare(
            "INSERT INTO telegram_tasks (id, text, time, done, created_at, user_id, source, due_date, ref_key) VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL)",
          )
          .bind(id, text, time, Date.now(), userId, input.source ?? "manual", input.due_date ?? null);

    const res = await stmt.run();
    const created = refKey ? Number(res?.meta?.changes ?? 1) > 0 : true;
    return { created, id };
  } catch (err: any) {
    return { created: false, id: null, error: err?.message ?? String(err) };
  }
}

/* ------------------------------------------------------------------ updates */

export type TgUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; first_name?: string; username?: string };
    from?: { first_name?: string; username?: string };
  };
};

const HELP = [
  "Content OS bot — send me anything and it becomes a task:",
  "",
  "• any text — saved for today",
  "• /task <text> — same, explicitly",
  "• /list — your open tasks",
  "• /done <n> — mark task n from /list as delivered",
  "• /id — your chat id (for Settings → Telegram)",
].join("\n");

/**
 * Turn one Telegram update into an action. The reply is returned rather than
 * sent, so the route decides when to talk to Telegram.
 */
export async function handleUpdate(
  env: any,
  row: WebhookRow,
  botToken: string,
  update: TgUpdate,
): Promise<{ action: string; detail: string; reply?: string }> {
  const userId = row.user_id;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = String(msg?.text ?? "").trim();

  if (!chatId || !text) {
    return { action: "ignored", detail: "no text message" };
  }

  await rememberChat(env, row, chatId);

  const [command, ...rest] = text.split(/\s+/);
  const cmd = command.toLowerCase().split("@")[0]; // "/list@mybot" is valid in groups
  const arg = rest.join(" ").trim();

  if (cmd === "/start" || cmd === "/id" || cmd === "/chatid") {
    // Saving it here means the Settings field fills itself in the moment the
    // user first talks to their bot — no copy-pasting a number by hand.
    const { chatId: stored } = await readTelegramConfig(env, userId);
    if (!stored) {
      await writeSetting(env, SETTINGS_KEYS.telegramChatId, String(chatId), userId);
    }
    return {
      action: "chat_id",
      detail: `chat ${chatId}`,
      reply:
        `Your Telegram chat id is ${chatId}\n` +
        (stored
          ? "It is already saved in Settings → Telegram."
          : "I have saved it in Content OS → Settings → Telegram."),
    };
  }

  if (cmd === "/help") {
    return { action: "help", detail: "help sent", reply: HELP };
  }

  if (cmd === "/list") {
    const tasks = await listOpenTasks(env, userId, 10);
    if (!tasks.length) {
      return { action: "list", detail: "no open tasks", reply: "Nothing open right now." };
    }
    const body = tasks
      .map((t, i) => `${i + 1}. ${t.text}${t.time ? ` · ${t.time}` : ""}`)
      .join("\n");
    return { action: "list", detail: `${tasks.length} open`, reply: `Open tasks:\n\n${body}` };
  }

  if (cmd === "/done") {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 1) {
      return { action: "done", detail: "bad index", reply: "Send /done <number> — see /list." };
    }
    const tasks = await listOpenTasks(env, userId, 10);
    const target = tasks[n - 1];
    if (!target) {
      return { action: "done", detail: "index out of range", reply: `No task ${n}. Send /list.` };
    }
    try {
      await env.DB.prepare("UPDATE telegram_tasks SET done = 1 WHERE id = ? AND user_id = ?")
        .bind(target.id, userId)
        .run();
    } catch (err: any) {
      return {
        action: "done",
        detail: "update failed",
        reply: `Could not update that task: ${err?.message ?? "database error"}`,
      };
    }
    await logActivity(env, "telegram-hook", "done", target.text.slice(0, 80), userId);
    return { action: "done", detail: target.text.slice(0, 60), reply: `Done ✅ “${target.text}”` };
  }

  if (cmd.startsWith("/") && cmd !== "/task") {
    return { action: "unknown_command", detail: cmd, reply: `Unknown command ${cmd}\n\n${HELP}` };
  }

  const body = cmd === "/task" ? arg : text;
  if (!body) {
    return { action: "empty", detail: "nothing to save", reply: HELP };
  }

  const written = await createTask(env, userId, { text: body, source: "telegram" });
  if (!written.created) {
    return {
      action: "error",
      detail: written.error ?? "could not save",
      reply: `Could not save that: ${written.error ?? "database error"}`,
    };
  }

  await logActivity(env, "telegram-hook", "task_created", body.slice(0, 80), userId);
  return {
    action: "task_created",
    detail: body.slice(0, 60),
    reply: `Saved ✅ “${body}” — it is on your dashboard now.`,
  };
}

async function listOpenTasks(
  env: any,
  userId: string,
  limit: number,
): Promise<Array<{ id: string; text: string; time: string | null }>> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, text, time FROM telegram_tasks WHERE user_id = ? AND COALESCE(done, 0) = 0 ORDER BY created_at DESC LIMIT ?",
    )
      .bind(userId, limit)
      .all();
    return (results ?? []) as Array<{ id: string; text: string; time: string | null }>;
  } catch {
    return [];
  }
}

/** Send the reply for one handled update. Errors are reported, never thrown. */
export async function replyTo(
  botToken: string,
  chatId: string | number,
  text: string,
): Promise<TelegramResult> {
  return sendTelegramTo(botToken, chatId, text);
}
