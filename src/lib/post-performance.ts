/**
 * Content OS — storing what a scrape found, without storing it twice.
 *
 * Two code paths wrote to `post_performance` and they disagreed. The cron wiped a handle's
 * rows and re-inserted the newest ten (`DELETE … WHERE handle = ?`), which threw the history
 * away on every run; the manual "scrape competitor" button only ever inserted. So pressing
 * that button twice stored the same post twice, and the brief — which ranks by likes — kept
 * pulling the same old post back to the top. The owner saw exactly that: "competitor watch
 * shows old, high-view posts".
 *
 * One rule now, for both: a post is identified by its URL, and storing it again updates it.
 * History is kept, duplicates cannot accumulate, and `project_id` set by the manual route
 * survives a later cron run.
 *
 * The migration `021_post_dedupe.sql` cleans up what the two rules left behind and adds a
 * partial unique index as a backstop.
 */

export type ScrapedPost = {
  caption?: string;
  likes?: number;
  comments?: number;
  url?: string;
  timestamp?: string;
};

/**
 * A scrape reports its own failures as if they were posts — "Apify API token not configured",
 * "error: …" — with no URL. Those rows are not posts; storing them made the brief's
 * competitor list show error text as if it were a competitor.
 */
export function isRealPost(post: ScrapedPost): boolean {
  if (!String(post.url ?? "").trim()) return false;
  return !/apify|not configured|error/i.test(String(post.caption ?? ""));
}

/**
 * Store scraped posts for one handle: update what we have seen, insert what we have not.
 * Returns how many landed. A single bad row is skipped rather than losing the whole run.
 */
export async function storePosts(
  env: any,
  userId: string,
  handle: string,
  posts: ScrapedPost[],
  isOwn: boolean,
  opts: { projectId?: string | null } = {},
): Promise<number> {
  const db = env?.DB;
  if (!db) return 0;

  let stored = 0;
  for (const post of posts) {
    if (!isRealPost(post)) continue;
    const url = String(post.url);

    try {
      const existing = (await db
        .prepare("SELECT id FROM post_performance WHERE user_id = ? AND handle = ? AND url = ?")
        .bind(userId, handle, url)
        .first()) as { id?: string } | null;

      if (existing?.id) {
        // Same post, fresher numbers. `COALESCE` on posted_at so a scrape that arrives
        // without a date cannot erase the date we already knew.
        await db
          .prepare(
            `UPDATE post_performance
                SET caption = ?, likes = ?, comments = ?, posted_at = COALESCE(?, posted_at), scraped_at = ?
              WHERE id = ?`,
          )
          .bind(
            String(post.caption ?? ""),
            Number(post.likes) || 0,
            Number(post.comments) || 0,
            post.timestamp ? String(post.timestamp) : null,
            Date.now(),
            existing.id,
          )
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO post_performance
               (id, handle, is_own_account, caption, likes, comments, url, posted_at, project_id, scraped_at, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            handle,
            isOwn ? 1 : 0,
            String(post.caption ?? ""),
            Number(post.likes) || 0,
            Number(post.comments) || 0,
            url,
            post.timestamp ? String(post.timestamp) : null,
            opts.projectId ?? null,
            Date.now(),
            userId,
          )
          .run();
      }
      stored++;
    } catch {
      /* skip a bad row rather than lose the whole run */
    }
  }
  return stored;
}
