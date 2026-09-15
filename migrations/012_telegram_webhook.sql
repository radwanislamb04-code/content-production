-- Content OS — Telegram intake (webhook) + auto-queued tasks
--
-- ⑤ from the master plan. Two new tables and three new columns; nothing existing
-- is renamed or dropped, so a rollback only means the new routes stop working.
--
--   telegram_webhook  — one row per user: the secret Telegram must present, the
--                       bot's @username, when the hook was registered, and the
--                       last error the Bot API reported (so the Settings card can
--                       say WHY nothing arrives instead of guessing).
--   telegram_updates  — every `update_id` already processed. Telegram re-sends an
--                       update until it gets a 2xx, so without this a single
--                       message could create the same task several times.
--
-- `telegram_tasks` gains:
--   source    — 'manual' | 'telegram' | 'calendar' | 'library'
--   due_date  — YYYY-MM-DD (Asia/Dhaka) for calendar-derived work
--   ref_key   — a stable key for auto-queued rows; the unique index below turns a
--               second queueing of the same calendar entry / script into a no-op.
--
-- NOTE: SQLite (and therefore D1) allows many NULLs in a UNIQUE index, so manual
-- tasks — which have no ref_key — are never deduplicated against each other.

CREATE TABLE IF NOT EXISTS telegram_webhook (
  user_id        TEXT PRIMARY KEY,
  secret         TEXT NOT NULL,
  bot_username   TEXT,
  chat_id        TEXT,
  registered_at  INTEGER,
  last_update_at INTEGER,
  last_error     TEXT,
  updates_seen   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telegram_webhook_secret
  ON telegram_webhook (secret);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id   INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_updates_user
  ON telegram_updates (user_id, received_at DESC);

ALTER TABLE telegram_tasks ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE telegram_tasks ADD COLUMN due_date TEXT;
ALTER TABLE telegram_tasks ADD COLUMN ref_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_tasks_ref
  ON telegram_tasks (user_id, ref_key);
