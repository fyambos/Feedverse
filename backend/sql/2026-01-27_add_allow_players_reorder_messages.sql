-- 2026-01-27_add_allow_players_reorder_messages.sql
-- Adds a scenario-level setting controlling who can reorder messages.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS allow_players_reorder_messages boolean NOT NULL DEFAULT true;
