-- Content OS — a competitor post is identified by its URL
--
-- Two writers had two rules. The cron wiped a handle's rows and re-inserted the newest ten
-- (`DELETE FROM post_performance WHERE handle = ?`), so no history ever existed to look back
-- at; the manual "scrape competitor" button only inserted. Pressing it twice between cron
-- runs stored the same post twice, and since the brief ranked competitors by likes, the
-- duplicate made that old post look doubly important.
--
-- `src/lib/post-performance.ts` now has the single rule (seen before → update, new → insert)
-- for both callers. This migration removes what the old rules left behind and adds a partial
-- unique index so a duplicate cannot be written even if a future caller forgets the rule.
--
-- A partial index, not a plain one: rows with no URL are not posts at all, and there may
-- legitimately be several of them.

-- 1. Keep the newest copy of any post that was stored more than once.
DELETE FROM post_performance
 WHERE url IS NOT NULL
   AND url <> ''
   AND rowid NOT IN (
     SELECT MAX(rowid)
       FROM post_performance
      WHERE url IS NOT NULL AND url <> ''
      GROUP BY user_id, handle, url
   );

-- 2. Drop rows that never described a post (a failed scrape stored its error text as one).
DELETE FROM post_performance WHERE url IS NULL OR url = '';

-- 3. And make it impossible to go back.
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_performance_natural
  ON post_performance (user_id, handle, url)
  WHERE url IS NOT NULL AND url <> '';
