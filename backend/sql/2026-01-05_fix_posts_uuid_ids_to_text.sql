-- Fix schema mismatch: the mobile app generates string post IDs like "po_...",
-- but the existing Neon schema had posts.id (and related FK columns) as UUID.
--
-- This migration converts posts.id, posts.parent_post_id, posts.quoted_post_id,
-- and likes.post_id from uuid -> text, while preserving referential integrity.

BEGIN;

-- Drop constraints that depend on posts.id type
ALTER TABLE likes
  DROP CONSTRAINT IF EXISTS likes_scenario_id_post_id_fkey;

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_parent_post_id_fkey,
  DROP CONSTRAINT IF EXISTS posts_quoted_post_id_fkey;

-- Convert post ID columns to text
ALTER TABLE posts
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN parent_post_id TYPE text USING parent_post_id::text,
  ALTER COLUMN quoted_post_id TYPE text USING quoted_post_id::text;

ALTER TABLE likes
  ALTER COLUMN post_id TYPE text USING post_id::text;

-- Re-create constraints with matching text types
ALTER TABLE posts
  ADD CONSTRAINT posts_parent_post_id_fkey
    FOREIGN KEY (parent_post_id)
    REFERENCES posts(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT posts_quoted_post_id_fkey
    FOREIGN KEY (quoted_post_id)
    REFERENCES posts(id)
    ON DELETE SET NULL;

ALTER TABLE likes
  ADD CONSTRAINT likes_scenario_id_post_id_fkey
    FOREIGN KEY (scenario_id, post_id)
    REFERENCES posts(scenario_id, id)
    ON DELETE CASCADE;

COMMIT;
