-- Adds audit fields needed for reporting (who last edited) and a lightweight
-- content_reports table to keep a server-side record of reports.

-- ===== Posts: track last edit attribution =====
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS edited_by_profile_id uuid;

-- ===== Messages: track original author + last edit attribution =====
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS edited_by_profile_id uuid;

-- ===== Reports: store a snapshot server-side (email remains primary delivery) =====
CREATE TABLE IF NOT EXISTS content_reports (
  id BIGSERIAL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),

  reporter_user_id uuid,
  kind text NOT NULL, -- 'post' | 'message'
  scenario_id uuid,
  conversation_id uuid,
  entity_id text NOT NULL,

  report_message text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  request_id text,
  user_agent text,
  ip text
);

CREATE INDEX IF NOT EXISTS content_reports_created_at_idx ON content_reports(created_at);
CREATE INDEX IF NOT EXISTS content_reports_kind_entity_idx ON content_reports(kind, entity_id);
