-- Content OS — DM Manager (Instagram automation), stage 1
--
-- Nine tables, all born with `user_id` (phase F made that possible, so this needs
-- no second migration later). Nothing here talks to Meta: stage 1 runs the same
-- engine the webhook will run in stage 2, driven by "Simulate a comment" — so the
-- rules, the 7-day window and the counters are all real and testable today.
--
--   dm_automations   one row per automation: trigger (comment or DM), the keywords,
--                    the public reply, the private DM, an optional button, an
--                    optional daily cap.
--   dm_contacts      one row per person (keyed by their Instagram-scoped id).
--   dm_tags / dm_contact_tags
--   dm_conversations one per contact: status (open / handoff / closed) and the
--                    timestamps the 7-day messaging window is computed from.
--   dm_messages      every public reply and DM, in and out, with the keyword that
--                    matched — so "why did the bot answer that?" is answerable.
--   dm_events        the engine's trace: matched, no match, cap reached, window
--                    expired. This is what the simulator shows, and it is the same
--                    thing a real webhook would write.
--   dm_leads         a contact that reached a goal ("guide", "price", …).
--
-- Deliberately NOT stored: Instagram passwords, scraped DMs, or anything the API
-- does not hand over officially. The rule engine decides; AI (stage 3) may only
-- suggest an intent.

CREATE TABLE IF NOT EXISTS dm_automations (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  trigger_type     TEXT NOT NULL DEFAULT 'comment',   -- comment | dm
  keywords         TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  match_mode       TEXT NOT NULL DEFAULT 'contains',  -- contains | exact | any_word
  post_scope       TEXT NOT NULL DEFAULT 'any',       -- any | post
  post_id          TEXT,
  public_reply     TEXT,
  dm_message       TEXT,
  dm_button_label  TEXT,
  dm_button_url    TEXT,
  counter_enabled  INTEGER NOT NULL DEFAULT 0,
  daily_cap        INTEGER NOT NULL DEFAULT 0,        -- 0 = uncapped
  goal             TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_automations_user
  ON dm_automations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_contacts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  ig_user_id   TEXT,
  username     TEXT,
  first_name   TEXT,
  last_name    TEXT,
  is_follower  INTEGER DEFAULT 0,
  comments     INTEGER NOT NULL DEFAULT 0,
  dms          INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_contacts_ig
  ON dm_contacts (user_id, ig_user_id);

CREATE TABLE IF NOT EXISTS dm_tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_contact_tags (
  contact_id TEXT NOT NULL,
  tag_id     TEXT NOT NULL,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  contact_id      TEXT NOT NULL,
  automation_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'open',   -- open | handoff | closed
  source          TEXT,                            -- comment | dm | simulated
  last_inbound_at INTEGER,                         -- the 7-day window runs from here
  last_outbound_at INTEGER,
  last_message_at INTEGER,
  unread          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_user
  ON dm_conversations (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS dm_messages (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  conversation_id TEXT,
  contact_id      TEXT,
  automation_id   TEXT,
  direction       TEXT NOT NULL,   -- in | out
  channel         TEXT NOT NULL,   -- comment | dm
  text            TEXT,
  matched_keyword TEXT,
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent | simulated | skipped | failed
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_user
  ON dm_messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_events (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  automation_id   TEXT,
  contact_id      TEXT,
  conversation_id TEXT,
  kind            TEXT NOT NULL,   -- matched | no_match | reply_sent | dm_sent |
                                   -- cap_reached | window_expired | simulated
  detail          TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_events_user
  ON dm_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_leads (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  contact_id    TEXT,
  automation_id TEXT,
  goal          TEXT,
  status        TEXT NOT NULL DEFAULT 'new',  -- new | contacted | won | lost
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
