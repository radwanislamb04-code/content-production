-- Adds content quality fields to the library table.
-- The original used ALTER TABLE ... ADD COLUMN IF NOT EXISTS, which
-- SQLite and D1 do not support. Plain ALTER TABLE ADD COLUMN is used
-- here so this applies cleanly on a fresh database.
-- The d1_migrations table tracks applied migrations, so re-running
-- is prevented at the migration-runner level.
ALTER TABLE library ADD COLUMN quality_score INTEGER DEFAULT 0;
ALTER TABLE library ADD COLUMN quality_analysis TEXT;
