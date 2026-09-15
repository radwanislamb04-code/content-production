import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";

/**
 * /api/telegram-tasks — the real task queue.
 *
 * GET    → recent tasks for the dashboard (newest first)
 * POST   → queue a task
 * PATCH  → { id, done } — tick a task off (or put it back)
 * DELETE → ?id=… remove one for good
 *
 * `telegram_tasks` is read by the cron (pending tasks get pushed to Telegram),
 * notifications and the pipeline, but nothing in the app ever INSERTed into it —
 * so the dashboard used to show four hardcoded sample tasks instead. POST is the
 * missing writer.
 *
 * `done` used to mean only "already delivered to Telegram". It now also means
 * "handled": a Telegram message routed to the Board or the calendar leaves the
 * open list the same way. PATCH/DELETE are what makes the queue a list you can
 * actually finish things from, instead of one that only grows.
 */

const ROW = "id, text, time, done, created_at, source, due_date, routed_to";

const patchSchema = z.object({
  id: z.string().trim().min(1).max(120),
  done: z.boolean(),
});

const createSchema = z.object({
  text: z.string().trim().min(1, "Write what needs doing.").max(300),
  time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Time must look like 09:30.")
    .optional(),
});

/** HH:MM in Asia/Dhaka — the timezone the schedule and briefs use. */
function dhakaTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

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
              `SELECT ${ROW} FROM telegram_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
            )
            .bind(await currentUserId(request, context))
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "No database binding available." },
            { status: 500 },
          );
        }

        const body = await request.json().catch(() => null);
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              ok: false,
              error: parsed.error.issues[0]?.message ?? "Invalid input.",
            },
            { status: 400 },
          );
        }

        const id = crypto.randomUUID();
        const time = parsed.data.time ?? dhakaTime();
        try {
          await db
            .prepare(
              `INSERT INTO telegram_tasks (id, text, time, done, created_at, user_id) VALUES (?, ?, ?, 0, ?, ?)`,
            )
            .bind(id, parsed.data.text, time, Date.now(), await currentUserId(request, context))
            .run();
        } catch (err: any) {
          return Response.json(
            {
              ok: false,
              error: `Could not save the task: ${err?.message ?? "database error"}`,
            },
            { status: 500 },
          );
        }

        await logActivity(
          env,
          "telegram-tasks",
          "created",
          `${parsed.data.text.slice(0, 80)} — queued for ${time}`,
          await currentUserId(request, context),
        );

        const task = await db
          .prepare(`SELECT ${ROW} FROM telegram_tasks WHERE id = ? AND user_id = ?`)
          .bind(id, await currentUserId(request, context))
          .first();
        return Response.json({ ok: true, task }, { status: 201 });
      },

      /** Tick it off (done: true) or put it back in the open list (done: false). */
      PATCH: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "No database binding available." },
            { status: 500 },
          );
        }

        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
            { status: 400 },
          );
        }

        const userId = await currentUserId(request, context);
        try {
          const res = await db
            .prepare("UPDATE telegram_tasks SET done = ? WHERE id = ? AND user_id = ?")
            .bind(parsed.data.done ? 1 : 0, parsed.data.id, userId)
            .run();
          if (Number(res?.meta?.changes ?? 0) === 0) {
            return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not update the task: ${err?.message ?? "database error"}` },
            { status: 500 },
          );
        }

        await logActivity(
          env,
          "telegram-tasks",
          parsed.data.done ? "done" : "reopened",
          parsed.data.id,
          userId,
        );

        const task = await db
          .prepare(`SELECT ${ROW} FROM telegram_tasks WHERE id = ? AND user_id = ?`)
          .bind(parsed.data.id, userId)
          .first();
        return Response.json({ ok: true, task });
      },

      DELETE: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "No database binding available." },
            { status: 500 },
          );
        }

        const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
        if (!id) {
          return Response.json({ ok: false, error: "Pass ?id=…" }, { status: 400 });
        }

        const userId = await currentUserId(request, context);
        try {
          const res = await db
            .prepare("DELETE FROM telegram_tasks WHERE id = ? AND user_id = ?")
            .bind(id, userId)
            .run();
          if (Number(res?.meta?.changes ?? 0) === 0) {
            return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not delete the task: ${err?.message ?? "database error"}` },
            { status: 500 },
          );
        }

        await logActivity(env, "telegram-tasks", "deleted", id, userId);
        return Response.json({ ok: true, id });
      },
    },
  },
});
