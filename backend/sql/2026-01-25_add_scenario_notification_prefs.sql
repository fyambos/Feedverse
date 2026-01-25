-- Per-user per-scenario notification preferences (push + in-app gating)
-- Safe to run multiple times (uses IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS scenario_notification_prefs (
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  mentions_enabled boolean NOT NULL DEFAULT true,
  replies_enabled boolean NOT NULL DEFAULT true,
  messages_enabled boolean NOT NULL DEFAULT true,
  group_messages_enabled boolean NOT NULL DEFAULT true,
  likes_enabled boolean NOT NULL DEFAULT true,
  reposts_enabled boolean NOT NULL DEFAULT true,
  quotes_enabled boolean NOT NULL DEFAULT true,

  ignored_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (scenario_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_notification_prefs_user_id
  ON scenario_notification_prefs (user_id);

COMMIT;
