import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { pendingWork, queuePendingWork } from "../../lib/autoqueue";
import { dhakaDateKey } from "../../lib/pipeline";
import { logActivity } from "../../lib/activity";

/**
 * /api/auto-queue — the queue the app fills in for you.
 *
 * GET  → what today's queue would hold, and what is already in it (a preview;
 *        nothing is written).
 * POST → write the missing ones. Safe to press twice: every auto row carries a
 *        `ref_key` with a UNIQUE index behind it, so the second press is a no-op.
 *
 * Sources are only what the app actually knows: today's calendar entries and
 * scripts still sitting in `draft`.
 */

export const Route = createFileRoute("/api/auto-queue")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const dateKey = dhakaDateKey();
        const items = await pendingWork(env, userId, dateKey);
        return Response.json({
          ok: true,
          date_key: dateKey,
          items,
          missing: items.filter((i) => !i.queued).length,
          already: items.filter((i) => i.queued).length,
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const result = await queuePendingWork(env, userId);
        await logActivity(
          env,
          "auto-queue",
          result.created ? "queued" : "nothing_to_queue",
          `${result.date_key}: ${result.created} new, ${result.skipped} already queued`,
          userId,
        );
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
