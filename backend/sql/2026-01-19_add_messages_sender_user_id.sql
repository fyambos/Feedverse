-- Store the authenticated user id who sent a message via a profile.
-- This is useful for moderation/auditing.

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'messages_sender_user_id_fkey'
      AND t.relname = 'messages'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_user_id_fkey
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id_created_at
  ON messages (sender_user_id, created_at);

COMMIT;
