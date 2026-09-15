/**
 * Content OS — activity log (the design's `activity-logger` agent).
 *
 * "Every agent calls this after completing work." The pipeline, the cron, the
 * AI routes and the Settings test all write here, and the UI reads it back:
 * AutoPilot's log panel and the TopNav notification feed both come from this
 * one table, so nothing has to invent its own history.
 *
 * Every line carries the user it belongs to. Writes default to the owner because
 * a log line describing the owner's own cron run is still the owner's; routes
 * that act for a signed-in user pass theirs explicitly.
 */

import { getEnv } from "./settings";
import { OWNER_ID, currentUserId } from "./users";

export type ActivityRow = {
  id: string;
  module: string;
  action: string;
  detail: string | null;
  created_at: number;
  user_id?: string | null;
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
  userId: string = OWNER_ID,
): Promise<boolean> {
  const db = env?.DB;
  if (!db) {
    lastError = "env.DB is not bound — activity write skipped";
    console.error("[activity]", lastError);
    return false;
  }
  try {
    // NOTE: bind().run() — the positional run(a, b, c...) form fails on this
    // runtime with "Wrong number of parameters bindings for SQL query".
    await db
      .prepare(
        "INSERT INTO activity (id, module, action, detail, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        String(module),
        String(action),
        typeof detail === "string" ? detail : JSON.stringify(detail ?? ""),
        Date.now(),
        userId,
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

/** Newest-first log lines, optionally filtered to one module and one user. */
export async function readActivity(
  env: any,
  limit = 50,
  module?: string | null,
  userId?: string,
): Promise<ActivityRow[]> {
  const db = env?.DB;
  if (!db) return [];
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200);
  try {
    const where: string[] = [];
    const args: unknown[] = [];
    if (module) {
      where.push("module = ?");
      args.push(module);
    }
    if (userId) {
      where.push("user_id = ?");
      args.push(userId);
    }
    const sql = `SELECT * FROM activity${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC LIMIT ?`;
    const { results } = await db
      .prepare(sql)
      .bind(...args, lim)
      .all();
    return (results ?? []) as ActivityRow[];
  } catch {
    return [];
  }
}

/** Timestamp of the newest entry for a module (or null) — used by AutoPilot. */
export async function lastActivityAt(
  env: any,
  module: string,
  userId?: string,
): Promise<number | null> {
  const rows = await readActivity(env, 1, module, userId);
  return rows.length ? rows[0].created_at : null;
}

/* ------------------------------------------------------------------ *
 * Request-shaped wrappers: a route only needs to say "the current user".
 * ------------------------------------------------------------------ */

export async function logActivityFor(
  request: Request,
  context: any,
  module: string,
  action: string,
  detail: unknown = "",
): Promise<boolean> {
  const env = getEnv(request, context);
  return logActivity(
    env,
    module,
    action,
    detail,
    await currentUserId(request, context),
  );
}

export async function readActivityFor(
  request: Request,
  context: any,
  limit = 50,
  module?: string | null,
): Promise<ActivityRow[]> {
  const env = getEnv(request, context);
  return readActivity(env, limit, module, await currentUserId(request, context));
}
