-- Content OS — Instagram webhook intake (M2)
--
-- Instagram retries a delivery until it gets a 2xx, exactly like Telegram, so a
-- comment that arrives twice must not be answered twice. The event's own id is the
-- key: Meta gives comments and messages a unique id, and a `comments` webhook for
-- the same comment would otherwise be replayed into a second public reply.
--
-- This table is also the audit trail the owner asked for: it is how we verify
-- behaviour Meta documents loosely (for example "one trigger per user per post")
-- instead of trusting a third-party blog.

CREATE TABLE IF NOT EXISTS ig_webhook_events (
  event_key   TEXT PRIMARY KEY,
  user_id     TEXT,
  ig_user_id  TEXT,
  field       TEXT,
  kind        TEXT,
  detail      TEXT,
  received_at INTEGER NOT NULL,
  handled_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ig_events_user
  ON ig_webhook_events (user_id, received_at DESC);
