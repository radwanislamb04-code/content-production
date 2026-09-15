-- Content OS — connected channels (many users, many Instagram accounts)
--
-- One row per connected account. Named `channels` rather than `instagram_*` on
-- purpose: WhatsApp and Messenger would be a new `platform` value, not a new
-- migration (the roadmap's M-phase keeps that door open).
--
-- Tokens are NEVER stored in clear text: `token_enc` holds
-- `v1.<iv>.<ciphertext>` from AES-GCM, keyed off the app secret, so a dump of this
-- table is not a set of live credentials. If the app secret is ever rotated, the
-- rows become undecryptable and the account is simply reconnected from the UI.
--
--   ig_user_id        the Instagram-scoped account id — also what a webhook's
--                     entry.id maps to, so an event finds its owner with no
--                     identity in the payload
--   token_expires_at  long-lived tokens last 60 days; the cron refreshes them and
--                     this is the date the UI shows you
--   status            'connected' | 'needs_reconnect' | 'paused'
--   last_event_at     when Instagram last delivered something — the honest way to
--                     tell "working" from "silently broken"

CREATE TABLE IF NOT EXISTS channels (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  platform         TEXT NOT NULL DEFAULT 'instagram',
  ig_user_id       TEXT,
  username         TEXT,
  account_type     TEXT,
  token_enc        TEXT,
  token_expires_at INTEGER,
  token_refreshed_at INTEGER,
  scopes           TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  last_event_at    INTEGER,
  last_error       TEXT,
  connected_at     INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_ig_user
  ON channels (platform, ig_user_id);

CREATE INDEX IF NOT EXISTS idx_channels_user
  ON channels (user_id, connected_at DESC);
