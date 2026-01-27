-- One-time codes for sensitive auth flows (password reset, password change confirmation).
-- Store only hashes (never store raw codes). Short expiry + limited attempts.

BEGIN;

CREATE TABLE IF NOT EXISTS user_one_time_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,

  -- sha256(secret + ":" + user_id + ":" + code) hex
  code_hash TEXT NOT NULL,

  attempt_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ NULL,

  request_ip TEXT NULL,
  request_user_agent TEXT NULL,
  used_ip TEXT NULL,
  used_user_agent TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_one_time_codes_lookup
  ON user_one_time_codes (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_one_time_codes_active_expires
  ON user_one_time_codes (expires_at)
  WHERE used_at IS NULL;

COMMIT;
