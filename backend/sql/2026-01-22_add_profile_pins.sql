-- Adds profile_pins table for per-profile pinned post ("pinned tweet").
-- One pin per profile (profile_id is the PK).

BEGIN;

CREATE TABLE IF NOT EXISTS profile_pins (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_pins_scenario_id
  ON profile_pins (scenario_id);

CREATE INDEX IF NOT EXISTS idx_profile_pins_post_id
  ON profile_pins (post_id);

COMMIT;
