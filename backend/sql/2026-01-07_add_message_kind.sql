-- Add a `kind` column to messages so special message types can be represented
BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';

COMMIT;
