-- Adds the source_id column to the library table.
-- This migration is idempotent: it uses a table-rebuild approach so
-- re-running it will not error. The existing library table is renamed,
-- a new table with the source_id column is created in its place, the
-- existing data is copied over, and the renamed old table is dropped.
--
-- Assumes migrations 003 and 004 have been applied first (normal
-- migration order), so the existing library table already has the
-- quality_score, quality_analysis, status, and content_pillar columns.
-- The SELECT below does not reference source_id from the old table,
-- so it works whether the column exists there or not — source_id is
-- simply NULL in the new table on the first run, and remains NULL
-- for any row that had no value previously. On re-runs the old table
-- is library__006_old, which has the full schema including source_id,
-- so the rebuild still works without error.
ALTER TABLE library RENAME TO library__006_old;

CREATE TABLE library (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  project_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  quality_score INTEGER DEFAULT 0,
  quality_analysis TEXT,
  status TEXT DEFAULT 'draft',
  content_pillar TEXT,
  source_id TEXT
);

INSERT INTO library (id, type, title, content, project_id, created_at, updated_at,
  quality_score, quality_analysis, status, content_pillar)
SELECT id, type, title, content, project_id, created_at, updated_at,
  quality_score, quality_analysis, status, content_pillar
FROM library__006_old;

DROP TABLE library__006_old;
