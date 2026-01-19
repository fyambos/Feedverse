-- Store the authenticated user id who authored a post via a profile.
-- Useful for moderation/auditing.

BEGIN;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS author_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'posts_author_user_id_fkey'
      AND t.relname = 'posts'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_author_user_id_fkey
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_posts_author_user_id_created_at
  ON posts (author_user_id, created_at DESC, id DESC);

COMMIT;
