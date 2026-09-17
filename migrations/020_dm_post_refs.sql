-- Content OS — post references, and a note on a rule (S5 polish)
--
-- `post_performance` describes a post by its URL and caption; a comment arrives with a
-- media id. Nothing joined the two, so the attribution table could name a post id but
-- never say what that post *was* — and "which reel brought these leads?" stayed half an
-- answer. This table is that join, entered once by the owner and remembered.
--
-- The note on a rule is free text for the thing a keyword cannot hold: what to say when
-- the comment lands while you are live, or a reminder to yourself about the rule.

CREATE TABLE IF NOT EXISTS dm_post_refs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  post_id    TEXT NOT NULL,
  url        TEXT,
  label      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One reference per post per user: re-saving corrects it rather than piling up rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_post_refs_unique
  ON dm_post_refs (user_id, post_id);

ALTER TABLE dm_automations ADD COLUMN note TEXT;
