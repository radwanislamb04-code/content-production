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
import { getWorkspace, putWorkspace } from "./workspace";

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
  source?: "manual" | "telegram" | "calendar" | "library" | "dm";
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
    /**
     * What Telegram is allowed to deliver. A missing "callback_query" here means
     * button taps are being dropped before they ever reach this Worker.
     */
    allowedUpdates: string[] | null;
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
      allowedUpdates: Array.isArray(info.info?.allowed_updates)
        ? (info.info.allowed_updates as string[])
        : null,
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
        // `callback_query` is what a button tap arrives as. Without it Telegram
        // accepts the webhook and then silently drops every tap — which is exactly
        // what happened: the buttons appeared, nothing happened when pressed.
        allowed_updates: ["message", "edited_message", "callback_query"],
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

/* ---------------------------------------------------------------- routing */

/**
 * Where a message can go. The buttons in the bot reply are this list; the tap
 * arrives as a `callback_query` and `routeInbox` does the actual move.
 */
export type Destination = "task" | "board" | "calendar" | "idea" | "remind" | "discard";

export const DESTINATIONS: Array<{ id: Destination; label: string }> = [
  { id: "task", label: "📋 Task" },
  { id: "board", label: "🗂 Board" },
  { id: "calendar", label: "📅 Calendar" },
  { id: "idea", label: "💡 Idea" },
  { id: "remind", label: "⏰ Remind" },
  { id: "discard", label: "🗑 Discard" },
];

/**
 * Telegram caps `callback_data` at 64 bytes and an id here is a 36-character
 * UUID, so a task + list pair would not fit. Eight characters is 4 billion
 * values — and `resolvePrefix` still refuses an ambiguous match rather than
 * guessing.
 */
export function shortId(id: string): string {
  return String(id ?? "").replace(/-/g, "").slice(0, 8);
}

/** Look a row up by the short id from a button, refusing an ambiguous match. */
async function resolveTask(env: any, userId: string, prefix: string) {
  const db = env?.DB;
  if (!db || !prefix) return null;
  try {
    const { results } = await db
      .prepare(
        "SELECT * FROM telegram_tasks WHERE user_id = ? AND id LIKE ? LIMIT 2",
      )
      .bind(userId, `${prefix}%`)
      .all();
    const rows = (results ?? []) as any[];
    return rows.length === 1 ? rows[0] : null;
  } catch {
    return null;
  }
}

/** The reply keyboard. Each row: Task/Board/Calendar, then Idea/Remind/Discard. */
export function inboxKeyboard(taskId: string): any {
  const short = shortId(taskId);
  const button = (id: Destination, label: string) => ({
    text: label,
    callback_data: `r:${id}:${short}`,
  });
  return {
    inline_keyboard: [
      [
        button("task", "📋 Task"),
        button("board", "🗂 Board"),
        button("calendar", "📅 Calendar"),
      ],
      [button("idea", "💡 Idea"), button("remind", "⏰ Remind"), button("discard", "🗑")],
    ],
  };
}

/** The second step: which column of the board? */
export function columnKeyboard(taskId: string, lists: Array<{ id: string; name: string }>) {
  const short = shortId(taskId);
  const rows: any[][] = [];
  let row: any[] = [];
  for (const list of lists.slice(0, 6)) {
    row.push({ text: list.name.slice(0, 22), callback_data: `c:${short}:${shortId(list.id)}` });
    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: "« back", callback_data: `b:${short}` }]);
  return { inline_keyboard: rows };
}

/** Today's month key + date key in Asia/Dhaka, the calendar's own format. */
function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * Do the move a button asked for. Every branch is user-scoped, and a row can only
 * be routed once — a second tap on an old message answers with where it already
 * went instead of filing it twice.
 */
export async function routeInbox(
  env: any,
  userId: string,
  taskPrefix: string,
  destination: Destination,
  opts: { listPrefix?: string } = {},
): Promise<{ ok: boolean; label: string; toast: string; detail?: string; error?: string }> {
  const db = env?.DB;
  if (!db) return { ok: false, label: "—", toast: "No database.", error: "no db" };

  const task = await resolveTask(env, userId, taskPrefix);
  if (!task) {
    return {
      ok: false,
      label: "—",
      toast: "I could not find that message any more.",
      error: "task not found",
    };
  }

  if (task.routed_to) {
    return {
      ok: true,
      label: task.routed_to === "library" ? "Idea" : String(task.routed_to),
      toast: `Already moved to ${task.routed_to}.`,
      detail: `already ${task.routed_to}`,
    };
  }

  const text = String(task.text ?? "");
  const now = Date.now();
  const dateKey = dhakaDate();

  const finish = async (routedTo: string, routedId: string, done: number) => {
    try {
      await db
        .prepare(
          "UPDATE telegram_tasks SET routed_to = ?, routed_id = ?, routed_at = ?, done = ? WHERE id = ? AND user_id = ?",
        )
        .bind(routedTo, routedId, now, done, task.id, userId)
        .run();
    } catch {
      /* the destination row exists either way; the flag is bookkeeping */
    }
  };

  if (destination === "task") {
    await finish("task", "", 0);
    return {
      ok: true,
      label: "Task",
      toast: "Stays in your task queue.",
      detail: "task queue",
    };
  }

  if (destination === "remind") {
    await finish("remind", dateKey, 0);
    return {
      ok: true,
      label: "Remind",
      toast: "It will be in the next Telegram briefing.",
      detail: "kept for the next briefing",
    };
  }

  if (destination === "discard") {
    try {
      await db
        .prepare("DELETE FROM telegram_tasks WHERE id = ? AND user_id = ?")
        .bind(task.id, userId)
        .run();
    } catch (err: any) {
      return { ok: false, label: "—", toast: "Could not remove it.", error: err?.message };
    }
    return { ok: true, label: "Discarded", toast: "Removed from the queue.", detail: "deleted" };
  }

  if (destination === "board") {
    // Which column? The oldest board (created first) is the user's main one.
    try {
      const board = await db
        .prepare(
          "SELECT id, name FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
        )
        .bind(userId)
        .first();
      if (!board) {
        return {
          ok: false,
          label: "—",
          toast: "You have no board yet — open Board once, then try again.",
          error: "no board",
        };
      }
      let list: any = null;
      if (opts.listPrefix) {
        const { results } = await db
          .prepare(
            "SELECT id, name FROM board_lists WHERE user_id = ? AND board_id = ? AND id LIKE ? LIMIT 2",
          )
          .bind(userId, board.id, `${opts.listPrefix}%`)
          .all();
        const rows = (results ?? []) as any[];
        list = rows.length === 1 ? rows[0] : null;
      } else {
        list = await db
          .prepare(
            "SELECT id, name FROM board_lists WHERE user_id = ? AND board_id = ? ORDER BY position ASC LIMIT 1",
          )
          .bind(userId, board.id)
          .first();
      }
      if (!list) {
        return { ok: false, label: "—", toast: "That column is gone.", error: "no list" };
      }

      const max = await db
        .prepare("SELECT COALESCE(MAX(position), 0) AS max FROM cards WHERE user_id = ? AND list_id = ?")
        .bind(userId, list.id)
        .first();
      const position = Number((max as any)?.max ?? 0) + 1000;
      const cardId = crypto.randomUUID();

      await db
        .prepare(
          "INSERT INTO cards (id, list_id, user_id, title, labels, due_date, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(cardId, list.id, userId, text.slice(0, 200), null, null, position, now, now)
        .run();

      await finish("board", cardId, 1);
      return {
        ok: true,
        label: "Board",
        toast: `Card added to “${list.name}”.`,
        detail: `${board.name} → ${list.name}`,
      };
    } catch (err: any) {
      return { ok: false, label: "—", toast: "Could not add the card.", error: err?.message };
    }
  }

  if (destination === "calendar") {
    try {
      const key = `calendar_${monthKey(dateKey)}`;
      const calendar: any = (await getWorkspace<any>(env, userId, key)) ?? {
        month: monthKey(dateKey),
        generated_at: now,
        entries: [],
      };
      const entries: any[] = Array.isArray(calendar.entries) ? calendar.entries : [];
      const time = /^\d{2}:\d{2}$/.test(String(task.time ?? "")) ? String(task.time) : dhakaTime();
      entries.push({ date: dateKey, type: "Reel", topic: text.slice(0, 200), time });
      entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const saved = await putWorkspace(env, userId, key, { ...calendar, entries });
      if (!saved) {
        return { ok: false, label: "—", toast: "Could not save the calendar.", error: "save failed" };
      }
      await finish("calendar", `${dateKey}@${time}`, 1);
      return {
        ok: true,
        label: "Calendar",
        toast: `Added to ${dateKey} at ${time}.`,
        detail: `${dateKey} ${time}`,
      };
    } catch (err: any) {
      return { ok: false, label: "—", toast: "Could not save the calendar.", error: err?.message };
    }
  }

  // idea
  try {
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO library
           (id, type, title, content, created_at, updated_at, user_id, quality_score, status, source_id)
         VALUES (?, 'idea', ?, ?, ?, ?, ?, 0, 'draft', NULL)`,
      )
      .bind(id, text.slice(0, 120), text, now, now, userId)
      .run();
    await finish("library", id, 1);
    return {
      ok: true,
      label: "Idea",
      toast: "Saved to Library → Ideas.",
      detail: "Library → Ideas",
    };
  } catch (err: any) {
    return { ok: false, label: "—", toast: "Could not save the idea.", error: err?.message };
  }
}

/** The board's columns, for the second step of the 🗂 button. */
export async function boardColumns(
  env: any,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const board = await env.DB.prepare(
      "SELECT id FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
    )
      .bind(userId)
      .first();
    if (!board) return [];
    const { results } = await env.DB.prepare(
      "SELECT id, name FROM board_lists WHERE user_id = ? AND board_id = ? ORDER BY position ASC LIMIT 6",
    )
      .bind(userId, board.id)
      .all();
    return (results ?? []) as Array<{ id: string; name: string }>;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ updates */

export type TgUpdate = {
  update_id?: number;
  /** A tap on one of the reply buttons — not a new message. */
  callback_query?: TgCallback;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; first_name?: string; username?: string };
    from?: { first_name?: string; username?: string };
  };
};

const HELP = [
  "Content OS bot",
  "",
  "Send anything — a task, an idea, a plan. Then tap where it belongs:",
  "📋 Task · 🗂 Board · 📅 Calendar · 💡 Idea · ⏰ Remind · 🗑 Discard",
  "",
  "No tapping? Type it straight in:",
  "• /card <text> — new card on the Board (To do)",
  "• /cal <text> — today's calendar at the posting time",
  "• /idea <text> — Library → Ideas",
  "",
  "• /list — your open tasks",
  "• /done <n> — mark task n from /list as delivered",
  "• /id — your chat id (for Settings → Telegram)",
].join("\n");

/** Text shortcuts for the same destinations — the buttons are the default. */
const TEXT_ALIASES: Record<string, Destination> = {
  "/card": "board",
  "/board": "board",
  "/cal": "calendar",
  "/calendar": "calendar",
  "/idea": "idea",
};

const DESTINATION_CONFIRMATION: Record<Destination, string> = {
  task: "Saved to your task queue",
  board: "Added to the Board",
  calendar: "Added to the calendar",
  idea: "Saved to Library → Ideas",
  remind: "Kept for the next briefing",
  discard: "Discarded",
};

/**
 * Turn one Telegram update into an action. The reply is returned rather than
 * sent, so the route decides when to talk to Telegram.
 */
export async function handleUpdate(
  env: any,
  row: WebhookRow,
  botToken: string,
  update: TgUpdate,
): Promise<{ action: string; detail: string; reply?: string; keyboard?: any }> {
  const userId = row.user_id;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = String(msg?.text ?? "").trim();

  // `=== undefined`, not `!chatId`: a falsy check would also swallow a chat id of
  // 0 (Telegram never sends one, but a wrong early-return is invisible).
  if (chatId === undefined || chatId === null || !text) {
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

  // Straight-to-a-destination shortcuts. The buttons are the normal path; these
  // exist so a fast typist never has to tap at all.
  const aliased = TEXT_ALIASES[cmd];
  if (aliased) {
    if (!arg) {
      return { action: "alias_no_text", detail: cmd, reply: `Give me the text: ${cmd} <text>` };
    }
    const written = await createTask(env, userId, { text: arg, source: "telegram" });
    if (!written.created || !written.id) {
      return {
        action: "error",
        detail: written.error ?? "could not save",
        reply: `Could not save that: ${written.error ?? "database error"}`,
      };
    }
    const routed = await routeInbox(env, userId, shortId(written.id), aliased);
    return {
      action: routed.ok ? `routed_${aliased}` : "error",
      detail: routed.detail ?? routed.toast,
      reply: routed.ok
        ? `${DESTINATION_CONFIRMATION[aliased]} ✅ “${arg}”`
        : `Could not file that: ${routed.toast}`,
    };
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
    // The buttons are the point: one tap says where this belongs, instead of
    // typing /card or /cal by hand.
    reply: `Saved ✅ “${body}”\nWhere should it go?`,
    keyboard: written.id ? inboxKeyboard(written.id) : undefined,
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

/* ------------------------------------------------------------------ buttons */

async function callBot(botToken: string, method: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `Telegram returned HTTP ${res.status}` };
    }
    return { ok: true, result: data?.result ?? null };
  } catch (err: any) {
    return { ok: false, error: `Telegram request failed: ${err?.message ?? String(err)}` };
  }
}

/** A message with inline buttons — the whole point of the intake. */
export async function sendWithKeyboard(
  botToken: string,
  chatId: string | number,
  text: string,
  keyboard?: any,
): Promise<TelegramResult> {
  const res = await callBot(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, messageId: res.result?.message_id, sent: 1 };
}

/**
 * Stop the little spinner on the button Telegram shows until this is called.
 * Always called (even for a failure) or the button looks broken to the user.
 */
export async function answerCallback(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await callBot(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 190) } : {}),
  });
}

/** Replace a message's text and/or its buttons (an empty keyboard clears it). */
export async function editMessage(
  botToken: string,
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard?: any,
): Promise<void> {
  await callBot(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    reply_markup: keyboard ?? { inline_keyboard: [] },
  });
}

export type TgCallback = {
  id?: string;
  data?: string;
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    text?: string;
  };
};

/**
 * One button tap.
 *
 * `callback_data` is `r:<destination>:<shortTaskId>` for the first row of buttons,
 * `c:<shortTaskId>:<shortListId>` for a column, and `b:<shortTaskId>` for "back" —
 * short because Telegram caps the field at 64 bytes.
 */
export async function handleCallback(
  env: any,
  row: WebhookRow,
  botToken: string,
  cb: TgCallback,
): Promise<{ action: string; detail: string; toast: string }> {
  const userId = row.user_id;
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const queryId = String(cb.id ?? "");
  const [kind, second, third] = String(cb.data ?? "").split(":");

  const finish = async (
    result: { ok: boolean; label: string; toast: string; detail?: string; error?: string },
    options: { keyboard?: any; keepText?: string } = {},
  ) => {
    if (queryId) await answerCallback(botToken, queryId, result.toast);
    if (chatId !== undefined && typeof messageId === "number") {
      const base = options.keepText ?? String(cb.message?.text ?? "").split("\nWhere should")[0];
      await editMessage(
        botToken,
        chatId,
        messageId,
        result.ok ? `${base}\n\n→ ${result.label}${result.detail ? ` (${result.detail})` : ""}` : `${base}\n\n⚠️ ${result.toast}`,
        options.keyboard,
      );
    }
    await logActivity(
      env,
      "telegram-hook",
      result.ok ? "routed" : "route_failed",
      `${String(cb.data ?? "")} → ${result.detail ?? result.error ?? result.label}`,
      userId,
    );
    return { action: `route_${result.label.toLowerCase()}`, detail: result.detail ?? result.toast, toast: result.toast };
  };

  if (kind === "b") {
    const restored = { ok: true, label: "Choose again", toast: "Where to?", detail: "menu" };
    if (queryId) await answerCallback(botToken, queryId);
    if (chatId !== undefined && typeof messageId === "number") {
      await editMessage(
        botToken,
        chatId,
        messageId,
        `Saved ✅\nWhere should it go?`,
        inboxKeyboard(second ?? ""),
      );
    }
    return { action: "route_menu", detail: "menu shown", toast: restored.toast };
  }

  if (kind === "c") {
    const result = await routeInbox(env, userId, second ?? "", "board", {
      listPrefix: third ?? "",
    });
    return finish(result);
  }

  if (kind === "r") {
    const destination = (second ?? "") as Destination;
    if (!DESTINATIONS.some((d) => d.id === destination)) {
      if (queryId) await answerCallback(botToken, queryId, "Unknown button.");
      return { action: "route_unknown", detail: String(cb.data ?? ""), toast: "Unknown button." };
    }

    // Board asks which column first — a card in the wrong column is just noise.
    if (destination === "board") {
      const columns = await boardColumns(env, userId);
      if (columns.length > 1) {
        if (queryId) await answerCallback(botToken, queryId, "Which column?");
        if (chatId !== undefined && typeof messageId === "number") {
          const base = String(cb.message?.text ?? "").split("\nWhere should")[0];
          await editMessage(
            botToken,
            chatId,
            messageId,
            `${base}\n\nWhich column?`,
            columnKeyboard(third ?? "", columns),
          );
        }
        return { action: "route_board_columns", detail: `${columns.length} columns`, toast: "Which column?" };
      }
    }

    const result = await routeInbox(env, userId, third ?? "", destination);
    return finish(result);
  }

  if (queryId) await answerCallback(botToken, queryId, "Unknown button.");
  return { action: "route_unknown", detail: String(cb.data ?? ""), toast: "Unknown button." };
}
