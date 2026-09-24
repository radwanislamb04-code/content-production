import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";

import { readTelegramConfig } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

const BATCH_LIMIT = 10;

export const Route = createFileRoute("/api/telegram-cron")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
      const env = getEnv(request, context);
      const db = env?.DB;
      const now = new Date().toISOString();

      // One identity for the whole handler: the caller's. This route used to take its
      // Telegram credentials from the caller and its *tasks* from OWNER_ID, so a second
      // account's chat received the owner's to-do list and then marked the owner's rows
      // done — while its own list never emptied.
      const uid = await currentUserId(request, context);

      const logActivity = async (action: string, detail: string) => {
        if (!db) return;
        try {
          await db
            .prepare(
              "INSERT INTO activity (id, module, action, detail, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(crypto.randomUUID(), "telegram-sync", action, detail, Date.now(), uid)
            .run();
        } catch {
          /* the log is best-effort; the send result is what the caller is told */
        }
      };

      // --- Load credentials ---
      // Settings → Notifications (KV) is the source of truth; the legacy
      // telegram_bot_token / telegram_chat_id keys and the env vars are
      // still honoured as fallbacks by readTelegramConfig.
      let botToken: string;
      let chatId: string;
      try {
        const cfg = await readTelegramConfig(env, uid);
        botToken = cfg.botToken ?? "";
        chatId = cfg.chatId ?? "";
      } catch {
        await logActivity("error", "KV keys unavailable");
        return Response.json({ error: "KV keys unavailable" }, { status: 500 });
      }

      if (!botToken || !chatId) {
        await logActivity("error", "Missing telegram_bot_token or telegram_chat_id in KV");
        return Response.json({ error: "Missing KV keys" }, { status: 500 });
      }

      // --- Fetch pending tasks ---
      let tasks: any[] = [];
      try {
        const { results } = await db
          .prepare(
            `SELECT * FROM telegram_tasks WHERE done = 0 AND user_id = ? ORDER BY created_at ASC LIMIT ?`,
          )
          .bind(uid, BATCH_LIMIT)
          .all();
        tasks = results ?? [];
      } catch {
        return Response.json({ error: "D1 query failed" }, { status: 500 });
      }

      if (!tasks.length) {
        await logActivity("no_tasks", "No pending tasks");
        return Response.json({ sent: 0, message: "No pending tasks" });
      }

      // --- Send to Telegram ---
      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      let sent = 0;
      const failed: string[] = [];

      for (const task of tasks) {
        const text = `<b>Review Reels</b>
<span>Task: ${escapeHtml(task.text)}</span>
<span>Time: ${task.time || "—"}</span>`;

        try {
          const res = await fetch(tgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: "HTML",
            }),
          });
          // Telegram answers 200 with `ok:false` when it refuses (bad chat id, blocked
          // bot). Counting the call instead of the answer is how "Sent 10 of 10" used to
          // be printed for messages that never arrived — and the task was marked done.
          const body: any = await res.json().catch(() => null);
          if (!res.ok || body?.ok === false) {
            failed.push(task.id);
            continue;
          }
          sent++;

          // Mark task as sent
          await db
            .prepare("UPDATE telegram_tasks SET done = 1 WHERE id = ? AND user_id = ?")
            .bind(task.id, uid)
            .run();
        } catch {
          failed.push(task.id);
        }
      }

      // --- Log to activity ---
      await logActivity(
        failed.length ? "tasks_partial" : "tasks_sent",
        `Sent ${sent} tasks to Telegram at ${now}${failed.length ? ` | ${failed.length} failed` : ""}`,
      );

      return Response.json({
        sent,
        total: tasks.length,
        failed: failed.length,
        message: `Sent ${sent} of ${tasks.length} tasks`,
      });
    },
    },
  },
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
