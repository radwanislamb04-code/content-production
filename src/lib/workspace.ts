/**
 * Content OS — the `workspace` key/value table.
 *
 * The original design keeps JSON blobs here instead of inventing a table per
 * feature:
 *   `calendar_YYYY-MM`    — the planner agent's monthly calendar
 *   `brief_YYYY-MM-DD`    — the daily brief (08:00 / 20:00 Asia/Dhaka)
 *   `thumb_prompt_<id>`   — a generated thumbnail prompt
 *   `idea_<...>`          — the selected idea (already in use)
 *
 * Keeping to that pattern means new features need no migration.
 */

export type WorkspaceKeyRow = { key: string; updated_at: number };

export async function getWorkspace<T = unknown>(
  env: any,
  key: string,
): Promise<T | null> {
  const db = env?.DB;
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT value FROM workspace WHERE key = ?")
      .bind(key)
      .first();
    if (!row?.value) return null;
    return JSON.parse(String(row.value)) as T;
  } catch {
    return null;
  }
}

/** Insert or replace a workspace value. */
export async function putWorkspace(
  env: any,
  key: string,
  value: unknown,
): Promise<boolean> {
  const db = env?.DB;
  if (!db) return false;
  try {
    await db
      .prepare(
        "INSERT INTO workspace (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .bind(key, JSON.stringify(value), Date.now())
      .run();
    return true;
  } catch {
    return false;
  }
}

/** Keys with a given prefix, newest first (e.g. `brief_` for Brief History). */
export async function listWorkspaceKeys(
  env: any,
  prefix: string,
  limit = 60,
): Promise<WorkspaceKeyRow[]> {
  const db = env?.DB;
  if (!db) return [];
  const lim = Math.min(Math.max(1, Number(limit) || 60), 200);
  try {
    const { results } = await db
      .prepare(
        "SELECT key, updated_at FROM workspace WHERE key LIKE ? ORDER BY key DESC LIMIT ?",
      )
      .bind(`${prefix}%`, lim)
      .all();
    return (results ?? []) as WorkspaceKeyRow[];
  } catch {
    return [];
  }
}
