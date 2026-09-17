-- Content OS — DM Manager S3: the flow layer.
--
-- Stage 1 could send exactly one DM. A flow sends a *sequence*: message, button,
-- quick reply, a wait, a condition, a tag, a custom field — the things every
-- ManyChat user actually builds. Three pieces of state make that possible:
--
--   dm_automations.flow_steps   the sequence itself, as JSON. Empty means "use the
--                               stage-1 fields" (dm_message / dm_button / goal), so
--                               every rule written before this migration keeps
--                               working byte for byte.
--
--   dm_flow_runs                a flow that stopped at a `delay` step. The wait is
--                               not a timer in memory — Workerd has no long-lived
--                               process — so the resumed position is a ROW, and the
--                               cron picks it up. One row per conversation, because
--                               a second trigger restarts the flow rather than
--                               stacking waits on top of each other.
--
--   dm_contact_fields           arbitrary per-person values a flow can set and read
--                               ("plan" = "pro", "city" = "Dhaka"). Tags already
--                               have their tables from stage 1; fields are what a
--                               thousand ManyChat flows quietly depend on.
--
-- And one flag on the conversation: `bot_paused`. When the owner answers by hand,
-- the bot must go quiet — that is the "human handoff" every automation tool has and
-- the reason a bot that keeps talking over you is worse than no bot. The pause is a
-- property of the THREAD, not of a rule, so it lives on dm_conversations.

ALTER TABLE dm_automations ADD COLUMN flow_steps TEXT NOT NULL DEFAULT '[]';

-- Instagram echoes back every message the account sends, including the ones we sent.
-- Without this column an echo cannot be told from the owner typing by hand, and the
-- bot would pause itself on its own reply. With it, "is this ours?" is a lookup.
ALTER TABLE dm_messages ADD COLUMN external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dm_messages_external
  ON dm_messages (user_id, external_id);

ALTER TABLE dm_conversations ADD COLUMN bot_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dm_conversations ADD COLUMN paused_at INTEGER;
ALTER TABLE dm_conversations ADD COLUMN paused_reason TEXT;

CREATE TABLE IF NOT EXISTS dm_flow_runs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  automation_id   TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  contact_id      TEXT,
  ig_user_id      TEXT,               -- who to answer, in Instagram's own language
  step_index      INTEGER NOT NULL DEFAULT 0,   -- the step to run when the wait ends
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | done | cancelled
  run_at          INTEGER NOT NULL,
  note            TEXT,               -- why it was cancelled, or what went out
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- The drain asks exactly one question — "what is due?" — so that is the index.
CREATE INDEX IF NOT EXISTS idx_dm_flow_runs_due
  ON dm_flow_runs (status, run_at);

-- One live wait per conversation: resuming or re-triggering replaces it instead of
-- producing two follow-ups to the same person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_flow_runs_conversation
  ON dm_flow_runs (conversation_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS dm_contact_fields (
  contact_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (contact_id, key)
);

CREATE INDEX IF NOT EXISTS idx_dm_contact_fields_user
  ON dm_contact_fields (user_id, key);
