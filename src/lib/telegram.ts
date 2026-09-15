import { OWNER_ID } from "./owner";
import { readTelegramConfig } from "./settings";

/**
 * Content OS — Telegram delivery.
 *
 * Credentials come from Settings → Notifications (Cloudflare KV), so rotating
 * the bot token never needs a redeploy. The design's `telegram-sync` agent
 * sends at most 10 messages per run; the brief is split into chunks and the
 * same cap applies here.
 */

export const MAX_MESSAGES_PER_RUN = 10;
export const TELEGRAM_CHUNK = 3800; // Telegram's hard limit is 4096

export type TelegramResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
  sent?: number;
};

/**
 * Send a plain-text message to an explicit bot + chat, with no settings lookup.
 *
 * The webhook intake needs this: it must answer the chat that wrote to it, which
 * is not necessarily the chat id stored in Settings (a second person may have
 * messaged the bot). Plain text on purpose — briefs contain user content, and an
 * unescaped `<` in HTML parse mode fails the whole send.
 */
export async function sendTelegramTo(
  botToken: string,
  chatId: string | number,
  text: string,
  opts: { disableNotification?: boolean; replyTo?: number } = {},
): Promise<TelegramResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(opts.replyTo ? { reply_to_message_id: opts.replyTo } : {}),
        ...(opts.disableNotification ? { disable_notification: true } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.description ?? `Telegram returned HTTP ${res.status}`,
      };
    }
    return { ok: true, messageId: data?.result?.message_id, sent: 1 };
  } catch (err: any) {
    return { ok: false, error: `Telegram request failed: ${err?.message ?? String(err)}` };
  }
}

/** Send a single plain-text message to the chat configured in Settings. */
export async function sendTelegram(
  env: any,
  text: string,
  opts: { disableNotification?: boolean } = {},
  userId: string = OWNER_ID,
): Promise<TelegramResult> {
  const { botToken, chatId } = await readTelegramConfig(env, userId);
  if (!botToken || !chatId) {
    return {
      ok: false,
      error:
        "Telegram is not configured — add the bot token and chat id in Settings → Notifications.",
    };
  }
  return sendTelegramTo(botToken, chatId, text, opts);
}

/** Split a long brief into Telegram-sized chunks and send them in order. */
export async function sendTelegramLong(
  env: any,
  text: string,
  opts: { disableNotification?: boolean } = {},
  userId: string = OWNER_ID,
): Promise<TelegramResult> {
  const chunks = splitForTelegram(text, MAX_MESSAGES_PER_RUN);
  let sent = 0;
  for (const chunk of chunks) {
    const r = await sendTelegram(env, chunk, opts, userId);
    if (!r.ok) return { ok: false, error: r.error, sent };
    sent++;
  }
  return { ok: true, sent };
}

/** Returns at most `maxChunks` pieces, each <= TELEGRAM_CHUNK characters. */
export function splitForTelegram(text: string, maxChunks = MAX_MESSAGES_PER_RUN): string[] {
  const clean = String(text ?? "").trim();
  if (!clean) return [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > 0 && out.length < maxChunks) {
    if (rest.length <= TELEGRAM_CHUNK) {
      out.push(rest);
      break;
    }
    // Prefer to cut on a line break, else on a space, else hard-cut.
    let cut = rest.lastIndexOf("\n", TELEGRAM_CHUNK);
    if (cut < TELEGRAM_CHUNK * 0.5) cut = rest.lastIndexOf(" ", TELEGRAM_CHUNK);
    if (cut < TELEGRAM_CHUNK * 0.5) cut = TELEGRAM_CHUNK;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return out;
}
