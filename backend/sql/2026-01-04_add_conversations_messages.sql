-- Adds conversations + messages tables required by the mobile Conversation/Message models.
-- Safe to run multiple times (uses IF NOT EXISTS / drops trigger before re-creating).

BEGIN;

-- Required for gen_random_uuid(). Safe if already installed.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  title text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  last_message_at timestamptz
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  edited_at timestamptz
);

-- Query helpers
CREATE INDEX IF NOT EXISTS idx_conversations_scenario_last_message_at
  ON conversations (scenario_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile
  ON conversation_participants (profile_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_scenario_created_at
  ON messages (scenario_id, created_at);

-- Keep conversations.last_message_at in sync
CREATE OR REPLACE FUNCTION touch_conversation_last_message() RETURNS trigger AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgname = 'trg_messages_touch_conversation_last_message'
      AND t.tgrelid = 'messages'::regclass
  ) THEN
    EXECUTE 'DROP TRIGGER trg_messages_touch_conversation_last_message ON messages';
  END IF;
END;
$$;
CREATE TRIGGER trg_messages_touch_conversation_last_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION touch_conversation_last_message();

COMMIT;
