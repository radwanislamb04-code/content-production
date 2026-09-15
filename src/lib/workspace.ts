/**
 * Content OS — the `workspace` key/value table.
 *
 * The original design keeps JSON blobs here instead of inventing a table per
 * feature:
 *   `calendar_YYYY-MM`    — the planner agent's monthly calendar
 *   `brief_YYYY-MM-DD`    — the daily brief (08:00 / 20:00 Asia/Dhaka)
 *   `thumb_prompt_<id>`   — a generated thumbnail prompt
 *   `idea_<...>`          — the selected idea
 *   `appearance`          — theme and the other appearance settings
 *   `sources:disabled`    — which scrapers the schedule must skip
 *
 * Every row is per-user. The primary key is (user_id, key) — it used to be `key`
 * alone, which meant two users could not both own a `brief_2026-09-15`.
 */

import { getEnv } from "./settings";
import { currentUserId } from "./users";

export type WorkspaceKeyRow = { key: string; updated_at: number };

export async function getWorkspace<T = unknown>(
  env: any,
  userId: string,
  key: string,
): Promise<T | null> {
  const db = env?.DB;
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT value FROM workspace WHERE user_id = ? AND key = ?")
      .bind(userId, key)
      .first();
    if (!row?.value) return null;
    return JSON.parse(String(row.value)) as T;
  } catch {
    return null;
  }
}

/** Insert or replace a workspace value for one user. */
export async function putWorkspace(
  env: any,
  userId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  const db = env?.DB;
  if (!db) return false;
  try {
    await db
      .prepare(
        "INSERT INTO workspace (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .bind(userId, key, JSON.stringify(value), Date.now())
      .run();
    return true;
  } catch {
    return false;
  }
}

/** One user's keys with a given prefix, newest first (e.g. `brief_`). */
export async function listWorkspaceKeys(
  env: any,
  userId: string,
  prefix: string,
  limit = 60,
): Promise<WorkspaceKeyRow[]> {
  const db = env?.DB;
  if (!db) return [];
  const lim = Math.min(Math.max(1, Number(limit) || 60), 200);
  try {
    const { results } = await db
      .prepare(
        "SELECT key, updated_at FROM workspace WHERE user_id = ? AND key LIKE ? ORDER BY key DESC LIMIT ?",
      )
      .bind(userId, `${prefix}%`, lim)
      .all();
    return (results ?? []) as WorkspaceKeyRow[];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Request-shaped wrappers: a route only needs to say "the current user".
 * ------------------------------------------------------------------ */

export async function getWorkspaceFor<T = unknown>(
  request: Request,
  context: any,
  key: string,
): Promise<T | null> {
  const env = getEnv(request, context);
  return getWorkspace<T>(env, await currentUserId(request, context), key);
}

export async function putWorkspaceFor(
  request: Request,
  context: any,
  key: string,
  value: unknown,
): Promise<boolean> {
  const env = getEnv(request, context);
  return putWorkspace(env, await currentUserId(request, context), key, value);
}

export async function listWorkspaceKeysFor(
  request: Request,
  context: any,
  prefix: string,
  limit = 60,
): Promise<WorkspaceKeyRow[]> {
  const env = getEnv(request, context);
  return listWorkspaceKeys(
    env,
    await currentUserId(request, context),
    prefix,
    limit,
  );
}
