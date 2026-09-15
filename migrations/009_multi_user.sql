-- 009_multi_user.sql — per-user content (phase F, step U1 + U2 schema)
--
-- Why: every table was single-tenant, so a second person would have shared the
-- owner's library, projects, keys and activity. This adds the users table and a
-- user_id column on every content table.
--
-- Safe to run on the live database: existing rows are assigned to the owner, and
-- no query reads user_id yet, so the app's behaviour is unchanged until the route
-- scoping lands. Nothing has to be re-created and no login changes.
--
-- The owner id is fixed and readable so it can be grepped:
--   usr_radwanislamb04

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  onboarded_at INTEGER
);

-- The owner. INSERT OR IGNORE keeps a re-run harmless.
INSERT OR IGNORE INTO users (id, email, name, role, status, created_at, onboarded_at)
VALUES ('usr_radwanislamb04', 'radwanislamb04@gmail.com', 'Radwan', 'owner', 'active', 1789000000000, 1789000000000);

ALTER TABLE library ADD COLUMN user_id TEXT;
ALTER TABLE projects ADD COLUMN user_id TEXT;
ALTER TABLE activity ADD COLUMN user_id TEXT;
ALTER TABLE post_performance ADD COLUMN user_id TEXT;
ALTER TABLE workspace ADD COLUMN user_id TEXT;
ALTER TABLE resources ADD COLUMN user_id TEXT;
ALTER TABLE telegram_tasks ADD COLUMN user_id TEXT;

-- Everything that exists today belongs to the owner.
UPDATE library SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE projects SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE activity SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE post_performance SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE workspace SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE resources SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;
UPDATE telegram_tasks SET user_id = 'usr_radwanislamb04' WHERE user_id IS NULL;

-- The workspace table is key/value; without user_id in the key two users would
-- collide on the same key (both calendars, both briefs). Reports whether any key
-- repeats once the column is in play.
-- (Verified by hand after the migration; indexes are added when route scoping lands.)
