// Content OS — Cloudflare cron dispatcher (Nitro plugin)
//
// WHY THIS FILE EXISTS
// --------------------
// `wrangler.toml` declares two cron triggers:
//
//   "0 9 * * *"    — daily morning brief
//   "0 */3 * * *"  — competitor viral check (every 3 hours)
//
// Nitro's `cloudflare-module` preset DOES emit a worker `scheduled` export, but
// that export only forwards to the Nitro hook `cloudflare:scheduled`:
//
//   scheduled(controller, env, context) {
//     context.waitUntil(nitroHooks.callHook("cloudflare:scheduled", { ... }));
//   }
//
// Nothing in the app registered a listener for that hook, so every cron fire
// was a silent no-op. This plugin registers the listener, which makes the
// triggers actually run.
//
// VERIFIED: the built worker exports
//   fetch, scheduled, email, queue, tail, trace
// and invoking `scheduled({ cron })` reaches the handlers below.
//
// HOW IT IS WIRED
// ---------------
// `vite.config.ts` → `nitro: { plugins: ["../server/plugins/content-os-cron.ts"] }`.
// Nitro does NOT auto-scan a `server/plugins/` directory in this setup, so the
// file is referenced explicitly.
//
// NOTE ON SCOPE
// -------------
// This plugin owns TRANSPORT + OBSERVABILITY only: which cron fired, and an
// `activity` table row so runs are visible. The actual brief/scrape business
// logic is deliberately left as explicit, logged stubs — see the sprint-4
// tasks in the audit report. A stub that logs beats a trigger that silently
// does nothing, but it is not a finished feature.

type CronEnv = {
  DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): { run(): Promise<unknown> };
    };
  };
  KV?: unknown;
  MEDIA?: unknown;
};

// Must match `[triggers].crons` in wrangler.toml exactly.
const MORNING_BRIEF_CRON = "0 9 * * *";
const COMPETITOR_CHECK_CRON = "0 " + "*/" + "3 * * *";

async function logActivity(
  env: CronEnv,
  action: string,
  detail: string,
): Promise<void> {
  const db = env && env.DB;
  if (!db) return; // local dev without bindings — nothing to log to

  try {
    await db
      .prepare(
        "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), "cron", action, detail, Date.now())
      .run();
  } catch {
    // Never let an observability write break the cron run.
  }
}

// Morning brief (09:00 UTC daily): assemble and deliver the daily brief.
async function runMorningBrief(env: CronEnv): Promise<void> {
  // TODO(sprint-4): scrape -> quality score -> ideate -> compose -> Telegram send.
  // The send half already exists on POST /api/telegram-cron; extract it into a
  // shared module before wiring it here so the logic lives in one place.
  await logActivity(
    env,
    "morning_brief_skipped",
    "cron fired; brief pipeline not implemented yet (see audit sprint 4)",
  );
}

// Competitor viral check (every 3 hours).
async function runCompetitorCheck(env: CronEnv): Promise<void> {
  // TODO(sprint-4): call the scrape-competitor logic, filter by viral score,
  // write rows into post_performance. The route already exists at
  // POST /api/scrape-competitor against the Apify Instagram actor.
  await logActivity(
    env,
    "competitor_check_skipped",
    "cron fired; competitor pipeline not implemented yet (see audit sprint 4)",
  );
}

const CRON_TASKS: Record<string, (env: CronEnv) => Promise<void>> = {
  [MORNING_BRIEF_CRON]: runMorningBrief,
  [COMPETITOR_CHECK_CRON]: runCompetitorCheck,
};

export default function contentOsCron(nitroApp: {
  hooks: { hook(name: string, handler: (payload: any) => unknown): void };
}) {
  nitroApp.hooks.hook(
    "cloudflare:scheduled",
    async ({ controller, env }: any) => {
      const cron: string = (controller && controller.cron) || "";
      const task = CRON_TASKS[cron];

      if (!task) {
        await logActivity(env, "cron_unknown", 'no task registered for "' + cron + '"');
        return;
      }

      try {
        await task(env as CronEnv);
        await logActivity(env, "cron_ok", '"' + cron + '" completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logActivity(env, "cron_failed", '"' + cron + '" failed: ' + message);
        // Re-throw into waitUntil so the failure surfaces in Workers Logs /
        // Observability instead of being swallowed.
        throw error;
      }
    },
  );
}
