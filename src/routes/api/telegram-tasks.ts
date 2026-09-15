import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/telegram-tasks — the real task queue.
 *
 * `telegram_tasks` is read by the cron (pending tasks get pushed to Telegram),
 * notifications and the pipeline, but nothing in the app ever INSERTS into it, so
 * in practice it stays empty until an intake is built. The dashboard used to fill
 * the gap with four hardcoded sample tasks and a checkbox that only toggled local
 * state; now it shows these rows or says honestly that nothing is queued.
 *
 * `done` means "already delivered to Telegram", not "completed by you".
 */

export const Route = createFileRoute("/api/telegram-tasks")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) return Response.json([]);
        try {
          const { results } = await db
            .prepare(
              "SELECT id, text, time, done, created_at FROM telegram_tasks ORDER BY created_at DESC LIMIT 50",
            )
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
    },
  },
});
