-- Add per-profile message read-tracking table
CREATE TABLE IF NOT EXISTS message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_profile ON message_reads(profile_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
