-- Store per-device login sessions for security UX ("Sessions" screen).
-- Backed by token hashes so we can revoke tokens without changing JWT payload format.

BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- sha256(token) hex string. Never store raw tokens.
  token_hash TEXT NOT NULL UNIQUE,

  user_agent TEXT NULL,
  ip TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  revoked_at TIMESTAMPTZ NULL,
  revoked_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_seen
  ON user_sessions (user_id, last_seen_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id)
  WHERE revoked_at IS NULL;

COMMIT;
