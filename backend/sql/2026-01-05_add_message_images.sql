-- Adds image support to DM messages.

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}'::text[];

COMMIT;
