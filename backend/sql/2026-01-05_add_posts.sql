-- Adds posts table required by the mobile Post model + backend posts endpoints.
-- Safe to run multiple times (uses IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS posts (
  id text PRIMARY KEY,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  text text NOT NULL,
  image_urls text[] NOT NULL DEFAULT '{}'::text[],

  reply_count integer NOT NULL DEFAULT 0,
  repost_count integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,

  parent_post_id text,
  quoted_post_id text,

  inserted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  post_type text,
  meta jsonb,

  is_pinned boolean NOT NULL DEFAULT false,
  pin_order integer,

  updated_at timestamptz
);

-- Query helpers
CREATE INDEX IF NOT EXISTS idx_posts_scenario_created_at
  ON posts (scenario_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_parent_post_id
  ON posts (parent_post_id);

CREATE INDEX IF NOT EXISTS idx_posts_author_profile_created_at
  ON posts (author_profile_id, created_at DESC, id DESC);

COMMIT;
