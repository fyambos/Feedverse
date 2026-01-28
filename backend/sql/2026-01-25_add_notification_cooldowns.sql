-- Prevent spammy duplicate notifications for the same recipient+event+actor+post.
-- Cooldown is enforced in code (15 minutes); this table stores last_sent_at.

BEGIN;

CREATE TABLE IF NOT EXISTS notification_cooldowns (
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_user_id, kind, actor_profile_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_cooldowns_last_sent_at
  ON notification_cooldowns (last_sent_at DESC);

COMMIT;
