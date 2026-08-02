import { createFileRoute } from "@tanstack/react-router";

const BATCH_LIMIT = 10;

export const Route = createFileRoute("/api/telegram-cron")({
  server: {
    POST: async ({ request, context }) => {
      const db = (context as any).cloudflare?.env?.DB;
      const kv = (context as any).cloudflare?.env?.KV;
      const now = new Date().toISOString();

      // --- Validate KV keys ---
      let botToken: string;
      let chatId: string;
      try {
        botToken = (await kv?.get("telegram_bot_token")) ?? "";
        chatId = (await kv?.get("telegram_chat_id")) ?? "";
      } catch {
        // KV not available — log and return
        if (db) {
          await db
            .prepare(
              "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(
              crypto.randomUUID(),
              "telegram-sync",
              "error",
              "KV keys unavailable",
              Date.now()
            )
            .run();
        }
        return Response.json({ error: "KV keys unavailable" }, { status: 500 });
      }

      if (!botToken || !chatId) {
        if (db) {
          await db
            .prepare(
              "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(
              crypto.randomUUID(),
              "telegram-sync",
              "error",
              "Missing telegram_bot_token or telegram_chat_id in KV",
              Date.now()
            )
            .run();
        }
        return Response.json({ error: "Missing KV keys" }, { status: 500 });
      }

      // --- Fetch pending tasks ---
      let tasks: any[] = [];
      try {
        const { results } = await db
          .prepare(
            `SELECT * FROM telegram_tasks WHERE done = 0 ORDER BY created_at ASC LIMIT ?`
          )
          .bind(BATCH_LIMIT)
          .all();
        tasks = results ?? [];
      } catch {
        return Response.json({ error: "D1 query failed" }, { status: 500 });
      }

      if (!tasks.length) {
        await db
          .prepare(
            "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
          )
          .bind(
            crypto.randomUUID(),
            "telegram-sync",
            "no_tasks",
            "No pending tasks",
            Date.now()
          )
          .run();
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
          await fetch(tgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: "HTML",
            }),
          });
          sent++;

          // Mark task as sent
          await db
            .prepare("UPDATE telegram_tasks SET done = 1 WHERE id = ?")
            .bind(task.id)
            .run();
        } catch {
          failed.push(task.id);
        }
      }

      // --- Log to activity ---
      await db
        .prepare(
          "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          "telegram-sync",
          "tasks_sent",
          `Sent ${sent} tasks to Telegram at ${now}${
            failed.length ? ` | ${failed.length} failed` : ""
          }`,
          Date.now()
        )
        .run();

      return Response.json({
        sent,
        total: tasks.length,
        failed: failed.length,
        message: `Sent ${sent} of ${tasks.length} tasks`,
      });
    },
  },
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
