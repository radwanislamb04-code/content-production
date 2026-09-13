import { createFileRoute } from "@tanstack/react-router";
import { getEnv, readTelegramConfig } from "../../lib/settings";

/**
 * POST /api/telegram-test — send a one-off message to the configured Telegram
 * chat, so the notification settings can be proven without waiting for the
 * 08:00 / 20:00 cron runs.
 */
export const Route = createFileRoute("/api/telegram-test")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const { botToken, chatId } = await readTelegramConfig(env);

        if (!botToken || !chatId) {
          return Response.json(
            {
              ok: false,
              error:
                "Telegram bot token / chat ID not configured — save them above first.",
            },
            { status: 400 },
          );
        }

        try {
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                parse_mode: "HTML",
                text:
                  "<b>Content OS</b>\nTest message — Telegram notifications are wired up.\n" +
                  `Sent ${new Date().toISOString()}`,
              }),
            },
          );
          const data: any = await res.json().catch(() => null);

          if (!res.ok || !data?.ok) {
            return Response.json(
              {
                ok: false,
                error:
                  data?.description ??
                  `Telegram returned HTTP ${res.status}. Check the bot token and chat ID.`,
              },
              { status: 502 },
            );
          }

          const db = env?.DB;
          if (db) {
            try {
              await db
                .prepare(
                  "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
                )
                .bind(
                  crypto.randomUUID(),
                  "telegram-test",
                  "sent",
                  "Test message sent from Settings",
                  Date.now(),
                )
                .run();
            } catch {
              /* logging is best-effort */
            }
          }

          return Response.json({
            ok: true,
            message_id: data?.result?.message_id ?? null,
          });
        } catch (err: any) {
          return Response.json(
            {
              ok: false,
              error: `Telegram request failed: ${err?.message ?? String(err)}`,
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
