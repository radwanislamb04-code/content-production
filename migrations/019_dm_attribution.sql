-- Content OS — where the DMs came from (S4c)
--
-- A comment arrives carrying the media it was left on (`value.media.id`), but until
-- now that id lived only for the length of one request: the engine used it to test a
-- post-scoped rule and then dropped it. So "which reel brought these leads?" had no
-- answer once the request was over.
--
-- Two columns rather than a new table: the post is a property of where a person came
-- from, and of each lead they produced. `source_post_id` stays NULL for a DM (there is
-- no post) or when Meta did not tell us which post it was.
--
-- The contact column is written with COALESCE, so it records the post that ACQUIRED
-- the person and never gets overwritten by a later comment on a different reel.

ALTER TABLE dm_contacts ADD COLUMN source_post_id TEXT;
ALTER TABLE dm_leads    ADD COLUMN source_post_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dm_contacts_source_post
  ON dm_contacts (user_id, source_post_id);

CREATE INDEX IF NOT EXISTS idx_dm_leads_source_post
  ON dm_leads (user_id, source_post_id);
