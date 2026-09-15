-- 011_card_attachments.sql — files attached to a kanban card.
--
-- The bytes live in R2 (binding MEDIA, bucket content-os-media — bound since the
-- beginning but never used until now); this table keeps the name, size and type so
-- the board can list an attachment without touching the object store.
--
-- `r2_key` is namespaced `attachments/<userId>/<cardId>/…`, which is also what the
-- download route checks before serving anything.

CREATE TABLE IF NOT EXISTS card_attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_attachments
  ON card_attachments (user_id, card_id, created_at);
