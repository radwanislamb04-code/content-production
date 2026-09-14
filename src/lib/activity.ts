/**
 * Content OS — activity log (the design's `activity-logger` agent).
 *
 * "Every agent calls this after completing work." The pipeline, the cron, the
 * AI routes and the Settings test all write here, and the UI reads it back:
 * AutoPilot's log panel and the TopNav notification feed both come from this
 * one table, so nothing has to invent its own history.
 */

export type ActivityRow = {
  id: string;
  module: string;
  action: string;
  detail: string | null;
  created_at: number;
};

/**
 * The last write failure, if any. `logActivity` must never throw (a broken log
 * line must not fail a pipeline run), but hiding the reason is worse — the
 * pipeline report and `wrangler tail` both surface this.
 */
let lastError: string | null = null;

export function lastActivityError(): string | null {
  return lastError;
}

/** Write one log line. Never throws — returns false and records why. */
export async function logActivity(
  env: any,
  module: string,
  action: string,
  detail: unknown = "",
): Promise<boolean> {
  const db = env?.DB;
  if (!db) {
    lastError = "env.DB is not bound — activity write skipped";
    console.error("[activity]", lastError);
    return false;
  }
  try {
    // NOTE: bind().run() — the positional run(a, b, c...) form fails on this
    // runtime with "Wrong number of parameter bindings for SQL query".
    await db
      .prepare(
        "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        String(module),
        String(action),
        typeof detail === "string" ? detail : JSON.stringify(detail ?? ""),
        Date.now(),
      )
      .run();
    lastError = null;
    return true;
  } catch (err: any) {
    lastError = err?.message ?? String(err);
    console.error("[activity] insert failed:", lastError);
    return false;
  }
}

/** Newest-first log lines, optionally filtered to one module. */
export async function readActivity(
  env: any,
  limit = 50,
  module?: string | null,
): Promise<ActivityRow[]> {
  const db = env?.DB;
  if (!db) return [];
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200);
  try {
    const stmt = module
      ? db
          .prepare(
            "SELECT * FROM activity WHERE module = ? ORDER BY created_at DESC LIMIT ?",
          )
          .bind(module, lim)
      : db
          .prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT ?")
          .bind(lim);
    const { results } = await stmt.all();
    return (results ?? []) as ActivityRow[];
  } catch {
    return [];
  }
}

/** Timestamp of the newest entry for a module (or null) — used by AutoPilot. */
export async function lastActivityAt(
  env: any,
  module: string,
): Promise<number | null> {
  const rows = await readActivity(env, 1, module);
  return rows.length ? rows[0].created_at : null;
}
