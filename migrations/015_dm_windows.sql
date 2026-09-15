-- Content OS — the three messaging clocks (S2a)
--
-- Stage 1 of the DM engine used a single 7-day window for everything. That is not
-- what Meta allows, and getting it wrong means either missing DMs we could have
-- sent or having them rejected. The real rules (verified 2026-09, see
-- content-os-instagram-connect-plan.md §1):
--
--   public reply to a comment   : always
--   private reply to a comment  : ONCE per comment, within 7 days of the COMMENT
--   direct message              : 24 hours from the person's last message
--   a human writing by hand     : 7 days (automated messages are NOT allowed)
--
-- The "once per comment" rule is the only one that needs storage: Meta keys it by
-- the comment id, so that is the primary key here. A second comment on the same
-- post is a new comment id and therefore allowed again.
--
-- It is also the audit trail for "why did the bot not answer that comment?".

CREATE TABLE IF NOT EXISTS dm_comment_replies (
  comment_id      TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  automation_id   TEXT,
  contact_id      TEXT,
  conversation_id TEXT,
  via             TEXT NOT NULL DEFAULT 'private_reply',
  replied_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_comment_replies_user
  ON dm_comment_replies (user_id, replied_at DESC);
