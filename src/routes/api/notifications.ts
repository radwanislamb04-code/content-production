import { createFileRoute } from "@tanstack/react-router";
import { readActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/notifications?limit=20&since=<ms>
 *
 * One event source, two places: the pipeline logs every step to `activity`,
 * Telegram gets the brief from the same run, and the TopNav bell reads this
 * feed. Nothing here invents an event.
 */

type Level = "error" | "success" | "info";

type Item = {
  id: string;
  ts: number;
  module: string;
  action: string;
  detail: string;
  level: Level;
  href: string;
};

/** Where clicking a notification should take you. */
const HREFS: Array<[RegExp, string]> = [
  [/^brief/, "/daily-brief"],
  [/^scrape/, "/sources"],
  [/^trends/, "/ideator"],
  [/^telegram/, "/settings"],
  [/^cron|^pipeline/, "/autopilot"],
  [/^ideator|^hook|^storyboard|^video/, "/ideator"],
];

function levelOf(action: string): Level {
  if (/fail|error/i.test(action)) return "error";
  if (/ok|sent|generated|scrape_ok|fetch_ok/i.test(action)) return "success";
  return "info";
}

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit") ?? 20)),
          50,
        );
        const since = Number(url.searchParams.get("since") ?? 0);

        const rows = await readActivity(env, limit, null);
        const items: Item[] = rows.map((r) => ({
          id: r.id,
          ts: r.created_at,
          module: r.module,
          action: r.action,
          detail: r.detail ?? "",
          level: levelOf(r.action),
          href: HREFS.find(([re]) => re.test(r.module))?.[1] ?? "/autopilot",
        }));

        // Pending items from the telegram-sync design (if any exist).
        if (env?.DB) {
          try {
            const { results } = await env.DB.prepare(
              "SELECT id, text, time, created_at FROM telegram_tasks WHERE COALESCE(done, 0) = 0 ORDER BY created_at DESC LIMIT 5",
            ).all();
            for (const t of (results ?? []) as any[]) {
              items.push({
                id: `task-${t.id}`,
                ts: Number(t.created_at) || Date.now(),
                module: "telegram-task",
                action: "pending",
                detail: `${t.text ?? ""}${t.time ? ` (${t.time})` : ""}`,
                level: "info",
                href: "/daily-brief",
              });
            }
          } catch {
            /* table empty or missing */
          }
        }

        items.sort((a, b) => b.ts - a.ts);
        const unread = since > 0 ? items.filter((i) => i.ts > since).length : 0;

        return Response.json({ ok: true, unread, items });
      },
    },
  },
});
