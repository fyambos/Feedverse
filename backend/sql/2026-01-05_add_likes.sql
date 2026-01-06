-- Adds likes table required by the mobile Like model + backend likes endpoints.
-- Safe to run multiple times (uses IF NOT EXISTS / conditional constraint creation).

BEGIN;

-- Required for gen_random_uuid(). Safe if already installed.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed (older schema), ensure it has an id column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'likes'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE likes ADD COLUMN id uuid;
    UPDATE likes SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE likes ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE likes ALTER COLUMN id SET NOT NULL;
  END IF;
END $$;

-- Ensure primary key exists (only if none exists yet).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE contype = 'p'
      AND conrelid = 'public.likes'::regclass
  ) THEN
    ALTER TABLE likes ADD CONSTRAINT likes_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- If an older schema used PRIMARY KEY (profile_id, post_id), switch it to PRIMARY KEY (id).
DO $$
DECLARE
  pk_name text;
  pk_def text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
  INTO pk_name, pk_def
  FROM pg_constraint c
  WHERE c.contype = 'p'
    AND c.conrelid = 'public.likes'::regclass
  LIMIT 1;

  IF pk_name IS NOT NULL AND pk_def IS NOT NULL AND pk_def NOT ILIKE '%PRIMARY KEY (id)%' THEN
    EXECUTE format('ALTER TABLE public.likes DROP CONSTRAINT %I', pk_name);
    ALTER TABLE public.likes ADD CONSTRAINT likes_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Foreign key to posts (scenario_id + post_id) when possible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'likes_scenario_id_post_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE likes
        ADD CONSTRAINT likes_scenario_id_post_id_fkey
          FOREIGN KEY (scenario_id, post_id)
          REFERENCES posts(scenario_id, id)
          ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      -- If posts doesn't have a matching unique constraint for (scenario_id, id),
      -- this FK can't be created. It's optional for the app.
      NULL;
    END;
  END IF;
END $$;

-- Prevent duplicate likes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'likes_profile_post_unique'
  ) THEN
    ALTER TABLE likes
      ADD CONSTRAINT likes_profile_post_unique UNIQUE (scenario_id, profile_id, post_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_likes_scenario_created_at
  ON likes (scenario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_profile
  ON likes (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_post
  ON likes (post_id, created_at DESC);

COMMIT;
