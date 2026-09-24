/**
 * The numbers the app knows about one account's work, in one place.
 *
 * Two callers need them: `GET /api/pipeline-status` (the Dashboard's Pipeline and
 * Continue Working cards) and the evening report the 20:00 cron sends. Written once so the
 * card and the message can never disagree about how much is waiting.
 *
 * The chain is followed through `library.source_id`: a storyboard names its script, a
 * video prompt names its storyboard. A row with no child is work that has not moved on.
 */
import type { PipelineFacts, RawCount } from "./pipeline-status";

const EMPTY: RawCount = { count: 0, newest: null };

/** Scripts no row of `childType` points at. */
const waitingSql = `
  SELECT COUNT(*) AS n FROM library parent
  WHERE parent.user_id = ?1 AND parent.type = ?
    AND NOT EXISTS (
      SELECT 1 FROM library child
      WHERE child.user_id = ?1 AND child.type = ?
        AND child.source_id = parent.id
    )`;

/** The newest row of `parentType` that no `childType` row points at. */
const nextSql = `
  SELECT id, title FROM library parent
  WHERE parent.user_id = ? AND parent.type = ?
    AND NOT EXISTS (SELECT 1 FROM library child
                    WHERE child.user_id = ? AND child.type = ?
                      AND child.source_id = parent.id)
  ORDER BY parent.created_at DESC LIMIT 1`;

export async function gatherPipelineFacts(
  env: any,
  userId: string,
): Promise<PipelineFacts> {
  const db = env?.DB;
  const facts: PipelineFacts = {
    ideas: EMPTY,
    scripts: EMPTY,
    storyboards: EMPTY,
    videoPrompts: EMPTY,
    plans: EMPTY,
    scriptsWaiting: 0,
    storyboardsWaiting: 0,
    nextScript: null,
    nextStoryboard: null,
    selectedIdeas: [],
  };
  if (!db) return facts;

  const [
    counts,
    scriptsWaiting,
    storyboardsWaiting,
    nextScript,
    nextStoryboard,
    plans,
    pickedIdeas,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT type, COUNT(*) AS n, MAX(created_at) AS newest FROM library
         WHERE user_id = ? AND type IN ('idea','script','storyboard','video_prompt')
         GROUP BY type`,
      )
      .bind(userId)
      .all(),
    db.prepare(waitingSql).bind(userId, "script", "storyboard").first(),
    db.prepare(waitingSql).bind(userId, "storyboard", "video_prompt").first(),
    db.prepare(nextSql).bind(userId, "script", "storyboard", userId).first(),
    db.prepare(nextSql).bind(userId, "storyboard", "video_prompt", userId).first(),
    db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(updated_at) AS newest FROM workspace
         WHERE user_id = ? AND key LIKE 'calendar_%'`,
      )
      .bind(userId)
      .first(),
    db
      .prepare(
        `SELECT value FROM workspace WHERE user_id = ? AND key LIKE 'idea_%'
         ORDER BY updated_at DESC LIMIT 3`,
      )
      .bind(userId)
      .all(),
  ]);

  const byType: Record<string, RawCount> = {};
  for (const row of (counts?.results ?? []) as Array<{ type: string; n: number; newest: number | null }>) {
    byType[row.type] = { count: Number(row.n) || 0, newest: row.newest ?? null };
  }
  facts.ideas = byType.idea ?? EMPTY;
  facts.scripts = byType.script ?? EMPTY;
  facts.storyboards = byType.storyboard ?? EMPTY;
  facts.videoPrompts = byType.video_prompt ?? EMPTY;
  facts.plans = { count: Number((plans as any)?.n) || 0, newest: (plans as any)?.newest ?? null };
  facts.scriptsWaiting = Number((scriptsWaiting as any)?.n) || 0;
  facts.storyboardsWaiting = Number((storyboardsWaiting as any)?.n) || 0;
  facts.nextScript = (nextScript as any)?.id
    ? { id: String((nextScript as any).id), title: String((nextScript as any).title) }
    : null;
  facts.nextStoryboard = (nextStoryboard as any)?.id
    ? { id: String((nextStoryboard as any).id), title: String((nextStoryboard as any).title) }
    : null;
  facts.selectedIdeas = ((pickedIdeas?.results ?? []) as Array<{ value: string }>)
    .map((r) => String(r.value ?? "").trim())
    .filter(Boolean);

  return facts;
}
