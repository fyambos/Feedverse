-- Add refresh tokens to user_sessions for access-token refresh & rotation.
--
-- Notes:
-- - Refresh tokens are stored as sha256(token) hex (never store raw).
-- - Existing rows will have NULL refresh fields; users will need to sign in again
--   to receive refresh tokens.

BEGIN;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT NULL;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash_unique
  ON user_sessions (refresh_token_hash)
  WHERE refresh_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_expires_at
  ON user_sessions (refresh_expires_at)
  WHERE refresh_expires_at IS NOT NULL;

COMMIT;
