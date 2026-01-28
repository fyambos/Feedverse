-- Add email verification state for users and pending email-change verification codes.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS pending_email_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  new_email TEXT NOT NULL,

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

-- One active request per user.
CREATE UNIQUE INDEX IF NOT EXISTS pending_email_changes_user_active_uidx
  ON pending_email_changes (user_id)
  WHERE used_at IS NULL;

-- Prevent two active requests for the same destination email.
CREATE UNIQUE INDEX IF NOT EXISTS pending_email_changes_new_email_active_uidx
  ON pending_email_changes (lower(new_email))
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS pending_email_changes_active_expires_idx
  ON pending_email_changes (expires_at)
  WHERE used_at IS NULL;

COMMIT;
