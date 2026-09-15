-- Content OS — where a Telegram message ends up.
--
-- A message to the bot used to become one thing: a Dashboard task. The reply now
-- carries buttons (Task · Board · Calendar · Idea · Remind · Discard) and the tap
-- has to be recorded, otherwise the same message could be filed twice.
--
--   routed_to  — 'board' | 'calendar' | 'library' | 'remind' | NULL (still a plain
--                task in the queue). A routed row is also marked done = 1 so it
--                leaves the open queue — `done` has always meant "handled", never
--                "the work is finished".
--   routed_id  — what the tap created (card id, calendar date key, library id).
--   routed_at  — when, so a second tap can be refused with a real reason.
--
-- Nothing existing is renamed or dropped: with all three NULL every current row
-- behaves exactly as before.

ALTER TABLE telegram_tasks ADD COLUMN routed_to TEXT;
ALTER TABLE telegram_tasks ADD COLUMN routed_id TEXT;
ALTER TABLE telegram_tasks ADD COLUMN routed_at INTEGER;
