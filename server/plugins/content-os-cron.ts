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

// Must match `[triggers].crons` in wrangler.toml exactly. Cron expressions are
// ALWAYS UTC; the Dhaka times above are what the user asked for.
const MORNING_BRIEF_CRON = "0 2 * * *";
const COMPETITOR_CHECK_CRON = "0 14 * * *";

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

        const failures: string[] = [];
        for (const user of users) {
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
