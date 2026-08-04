-- Adds ideator fields to the library table.
-- NOTE: These columns were added manually to the live remote D1 database earlier;
-- this migration exists for consistency and future rebuilds.
ALTER TABLE library ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE library ADD COLUMN IF NOT EXISTS content_pillar TEXT;
