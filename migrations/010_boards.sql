-- 010_boards.sql — the Kanban board (Trello-style), per user from day one.
--
-- Written AFTER phase F so every table carries user_id at birth; nothing here needs
-- a second migration pass. `position` is REAL so a card can be dropped between two
-- others by taking the midpoint — no renumbering of the whole column.

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS board_lists (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 1000,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- comma-separated label names; labels themselves are a fixed palette in the UI
  labels TEXT,
  due_date TEXT,
  -- JSON array of { text, done }
  checklist TEXT,
  cover_url TEXT,
  position REAL NOT NULL DEFAULT 1000,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A card can point at the Content OS item it is about (an idea, a script…).
CREATE TABLE IF NOT EXISTS card_links (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_lists ON board_lists (user_id, board_id, position);
CREATE INDEX IF NOT EXISTS idx_cards ON cards (user_id, list_id, position);
CREATE INDEX IF NOT EXISTS idx_card_comments ON card_comments (card_id, created_at);
