-- Adds ideator fields to the library table.
-- The original used ALTER TABLE ... ADD COLUMN IF NOT EXISTS, which
-- SQLite and D1 do not support. Plain ALTER TABLE ADD COLUMN is used
-- here so this applies cleanly on a fresh database.
-- Original note preserved: these columns were added manually to the
-- live remote D1 database earlier; this migration exists for
-- consistency and future rebuilds.
ALTER TABLE library ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE library ADD COLUMN content_pillar TEXT;
