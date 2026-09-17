// Content OS — Cloudflare cron dispatcher (Nitro plugin)
//
// WHY THIS FILE EXISTS
// --------------------
// `wrangler.toml` declares two cron triggers:
//
//   "0 2 * * *"   — 02:00 UTC = 08:00 Asia/Dhaka — morning brief
//   "0 14 * * *"  — 14:00 UTC = 20:00 Asia/Dhaka — evening competitor check
//
// Nitro's `cloudflare-module` preset DOES emit a worker `scheduled` export, but
// that export only forwards to the Nitro hook `cloudflare:scheduled`:
//
//   scheduled(controller, env, context) {
//     context.waitUntil(nitroHooks.callHook("cloudflare:scheduled", { ... }));
//   }
//
// Nothing in the app registered a listener for that hook, so every cron fire
// was a silent no-op. This plugin registers the listener.
//
// HOW IT IS WIRED
// ---------------
// `vite.config.ts` → `nitro: { plugins: ["../server/plugins/content-os-cron.ts"] }`.
// Nitro does NOT auto-scan a `server/plugins/` directory in this setup, so the
// file is referenced explicitly.
//
// WHAT IT DOES NOW
// ----------------
// Transport only: it decides which steps each trigger runs and hands them to
// the shared pipeline in `src/lib/pipeline.ts` — the exact same runner the
// AutoPilot buttons call on demand via `POST /api/run-pipeline`. Step results,
// deliveries and failures are all recorded in the `activity` table.

import { logActivity } from "../../src/lib/activity";
import { runPipeline } from "../../src/lib/pipeline";
import { queuePendingWork } from "../../src/lib/autoqueue";
import {
  decryptToken,
  ensureSubscriptions,
  listChannels,
  markChannel,
  refreshDueChannels,
} from "../../src/lib/channels";
import { privateReply, publicReply, sendDm } from "../../src/lib/instagram-api";
import { drainDueRuns, type Delivery } from "../../src/lib/dm";
import { sendTelegram } from "../../src/lib/telegram";

// Must match `[triggers].crons` in wrangler.toml exactly. Cron expressions are
// ALWAYS UTC; the Dhaka times above are what the user asked for.
const MORNING_BRIEF_CRON = "0 2 * * *";
const COMPETITOR_CHECK_CRON = "0 14 * * *";

// S3: the follow-up ladder needs a clock finer than twice a day — a 4-hour follow-up
// that fires up to twelve hours late is not a follow-up. Every 15 minutes is 96
// fires a day, which is nothing next to the request budget, and it is what makes
// "wait 4 hours" mean four hours.
const FOLLOWUP_CRON = "*/15 * * * *";

/**
 * The wire the ladder sends over. It is built here and handed to `drainDueRuns`
 * rather than imported by it, which is why `src/lib/dm.ts` still knows nothing about
 * Instagram: the engine decides, this decides how the decision leaves the building.
 */
async function resolveDelivery(env: any, userId: string): Promise<Delivery | null> {
  const channels = await listChannels(env, userId);
  const channel =
    channels.find((c) => c.status === "connected" && !!c.token_enc) ??
    channels.find((c) => !!c.token_enc);
  if (!channel?.ig_user_id) return null;
  const token = await decryptToken(env, channel.token_enc);
  if (!token) return null;

  return async (args) => {
    const res =
      args.channel === "comment"
        ? await publicReply(token, channel.ig_user_id!, String(args.commentId ?? ""), args.text)
        : args.via === "private_reply"
          ? await privateReply(token, channel.ig_user_id!, String(args.commentId ?? ""), args.text)
          : await sendDm(token, channel.ig_user_id!, String(args.igsid ?? ""), args.text);
    if (!res.ok) {
      await markChannel(env, channel.id, { error: res.error ?? "send failed" });
    }
    return { ok: res.ok, error: res.error };
  };
}

// 08:00 — fresh trends + competitor data, compose the brief, deliver it.
const MORNING_STEPS = ["trends", "scrape", "brief", "send"];

// 20:00 — refresh competitor data and deliver the evening update.
const EVENING_STEPS = ["scrape", "brief", "send"];

const CRON_TASKS: Record<string, string[]> = {
  [MORNING_BRIEF_CRON]: MORNING_STEPS,
  [COMPETITOR_CHECK_CRON]: EVENING_STEPS,
};

export default function contentOsCron(nitroApp: {
  hooks: { hook(name: string, handler: (payload: any) => unknown): void };
}) {
  nitroApp.hooks.hook(
    "cloudflare:scheduled",
    async ({ controller, env }: any) => {
      const cron: string = (controller && controller.cron) || "";

      // The ladder runs on its own trigger, before any of the daily work: a person
      // waiting on a 4-hour follow-up should not be held up by the morning brief.
      if (cron === FOLLOWUP_CRON) {
        try {
          const report = await drainDueRuns(env, (userId) => resolveDelivery(env, userId), {
            limit: 30,
          });
          if (report.due) {
            await logActivity(
              env,
              "dm",
              report.failed ? "followups_partial" : "followups",
              `${report.due} due · ${report.resumed} sent · ${report.cancelled} cancelled · ${report.failed} failed`,
            );
          }
        } catch (err: any) {
          await logActivity(env, "dm", "followups_failed", String(err?.message ?? err));
        }
        return;
      }

      const steps = CRON_TASKS[cron];

      if (!steps) {
        await logActivity(env, "cron", "cron_unknown", `no task for "${cron}"`);
        return;
      }

      try {
        // One run per active user: each has their own keys, pillars, library and
        // Telegram bot, and none of them may spend anybody else's.
        const rows = await env.DB.prepare(
          "SELECT id, email FROM users WHERE status = 'active' ORDER BY created_at ASC",
        ).all();
        const users = (rows?.results ?? []) as { id: string; email: string }[];

        if (!users.length) {
          await logActivity(
            env,
            "cron",
            "cron_skipped",
            `no active users to run "${cron}" for`,
          );
          return;
        }

        // Instagram maintenance, once per run and independent of the users loop:
        // refresh the tokens (60-day ones, so nothing is ever done by hand) and
        // repair webhook subscriptions that went missing. Anything that cannot be
        // fixed is reported to the owner instead of failing quietly.
        try {
          const refreshed = await refreshDueChannels(env);
          const healed = await ensureSubscriptions(env);
          if (refreshed.refreshed || healed.fixed || refreshed.failed) {
            await logActivity(
              env,
              "instagram",
              "maintenance",
              `tokens: ${refreshed.refreshed} refreshed, ${refreshed.failed} failed of ${refreshed.checked}; subscriptions: ${healed.fixed} repaired of ${healed.checked}`,
            );
          }

          const broken = refreshed.details.filter(
            (d) => d.action === "expired" || d.action === "undecryptable" || d.action === "failed",
          );
          if (broken.length) {
            await sendTelegram(
              env,
              [
                "⚠️ An Instagram connection needs you",
                "",
                ...broken.map((b) => `• ${b.channel} — ${b.detail ?? b.action}`),
                "",
                "Open Content OS → DM Manager → Connections and press Connect again.",
              ].join("\n"),
              {},
            );
          }
        } catch (err: any) {
          await logActivity(env, "instagram", "maintenance_failed", String(err?.message ?? err));
        }

        const failures: string[] = [];
        for (const user of users) {
          // Fill the task queue from what the app already knows (today's calendar
          // entries plus scripts still in draft) BEFORE the brief is composed, so
          // the brief's "today's tasks" section is current. Deduplicated by
          // ref_key, so the 20:00 run cannot re-add the morning's rows.
          const queue = await queuePendingWork(env, user.id);
          if (queue.created) {
            await logActivity(
              env,
              "auto-queue",
              "queued",
              `${queue.date_key}: ${queue.created} new task(s), ${queue.skipped} already queued`,
              user.id,
            );
          }

          const report = await runPipeline(env, steps, user.id);
          const failed = report.steps.filter((s) => !s.ok);
          const summary = report.steps
            .map((s) => `${s.step}:${s.ok ? "ok" : "failed"}`)
            .join(" ");

          await logActivity(
            env,
            "cron",
            failed.length ? "cron_partial" : "cron_ok",
            `${user.email} · "${cron}" → ${summary}${report.telegramSent ? ` · ${report.telegramSent} message(s) sent` : ""}`,
            user.id,
          );

          if (failed.length) {
            failures.push(
              `${user.email}: ${failed.map((f) => `${f.step}: ${f.detail}`).join(", ")}`,
            );
          }
        }

        if (failures.length) {
          // Surface partial failures in Workers Logs / Observability instead of
          // hiding them behind a green "completed" line.
          throw new Error(failures.join(" | "));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logActivity(env, "cron", "cron_failed", `"${cron}" failed: ${message}`);
        throw error;
      }
    },
  );
}
