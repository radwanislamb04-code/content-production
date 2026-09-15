import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import {
  getEnv,
  readTelegramConfig,
  SETTINGS_KEYS,
  writeSetting,
} from "../../lib/settings";
import { getWebhook } from "../../lib/telegram-hook";

/**
 * POST /api/telegram-chat-id — discover and save the chat id.
 *
 * The one manual step in Telegram setup is finding your chat id: the bot can
 * only see chats that messaged it first. This asks Telegram's getUpdates and
 * stores whatever it finds, so the Settings page can offer a button instead of
 * telling the user to paste a URL into a browser.
 *
 * IMPORTANT: `getUpdates` and a registered webhook are mutually exclusive —
 * Telegram answers "Conflict: can't use getUpdates method while webhook is
 * active". So once the intake hook is on (step ⑤), the chat id the webhook has
 * already seen is the answer, and only an unregistered bot falls back to
 * getUpdates.
 */
export const Route = createFileRoute("/api/telegram-chat-id")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const { botToken } = await readTelegramConfig(env, userId);

        if (!botToken) {
          return Response.json(
            { ok: false, error: "Save the bot token first (Settings → Notifications)." },
            { status: 400 },
          );
        }

        // Who are we?
        // `getUpdates` and a registered webhook are mutually exclusive, so the
        // chat the intake hook already saw is the answer — only an unregistered
        // bot falls through to getUpdates below.
        const hook = await getWebhook(env, userId);
        if (hook?.chat_id) {
          await writeSetting(env, SETTINGS_KEYS.telegramChatId, hook.chat_id, userId);
          return Response.json({
            ok: true,
            chat_id: hook.chat_id,
            name: "",
            username: "",
            bot: hook.bot_username ?? "",
            source: "intake hook",
            others: [],
          });
        }

        let botName = "";
        try {
          const me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
          const meJson = (await me.json()) as any;
          if (meJson?.ok) botName = meJson.result?.username ?? "";
        } catch {
          /* fall through to getUpdates, which will fail the same way */
        }

        let updates: any[] = [];
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
          const json = (await res.json()) as any;
          if (!json?.ok) {
            return Response.json(
              { ok: false, error: json?.description ?? "Telegram rejected the token." },
              { status: 502 },
            );
          }
          updates = json.result ?? [];
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not reach Telegram: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        const chats = new Map<number, { type: string; name: string; username: string }>();
        for (const u of updates) {
          for (const key of ["message", "edited_message", "channel_post", "my_chat_member"]) {
            const chat = u?.[key]?.chat;
            if (chat?.id && !chats.has(chat.id)) {
              chats.set(chat.id, {
                type: chat.type ?? "",
                name: chat.first_name || chat.title || "",
                username: chat.username ?? "",
              });
            }
          }
        }

        if (chats.size === 0) {
          return Response.json(
            {
              ok: false,
              error: botName
                ? `No messages yet. Open @${botName} in Telegram, send it any message, then press this button again.`
                : "No messages yet. Send your bot a message in Telegram, then try again.",
              bot: botName,
            },
            { status: 400 },
          );
        }

        // Prefer a private chat with the user; otherwise take the first chat.
        const entries = [...chats.entries()];
        const [chatId, info] = entries.find(([, c]) => c.type === "private") ?? entries[0];

        await writeSetting(env, SETTINGS_KEYS.telegramChatId, String(chatId), await currentUserId(request, context));

        return Response.json({
          ok: true,
          chat_id: String(chatId),
          name: info.name,
          username: info.username,
          bot: botName,
          others: entries.filter(([id]) => String(id) !== String(chatId)).map(([id, c]) => ({
            chat_id: String(id),
            name: c.name,
            type: c.type,
          })),
        });
      },
    },
  },
});
