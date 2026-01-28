-- Pending signup email verification codes.
-- Used to verify a user's email address before creating their account.
-- Store only code hashes (never store raw codes).

BEGIN;

CREATE TABLE IF NOT EXISTS pending_signup_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  username TEXT NOT NULL,

  -- sha256(secret + ":" + email + ":" + code) hex
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

-- Keep only one active row per email; when re-requesting, we overwrite the active row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_signup_active_email
  ON pending_signup_verifications (LOWER(TRIM(email)))
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_signup_active_expires
  ON pending_signup_verifications (expires_at)
  WHERE used_at IS NULL;

COMMIT;
