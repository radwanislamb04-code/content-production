-- Resources (saved tool/library sites).
--
-- Column note: this file originally declared `iframe INTEGER DEFAULT 0`, but the
-- deployed database (5c5ad5d5… era) has `description` and `is_custom` instead.
-- The POST handler wrote `iframe`, which does not exist live, so EVERY "Add Site"
-- failed with a 500 and the table could never be filled. The declaration below
-- now matches the live schema, and the handler writes only these columns.
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  is_custom INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
