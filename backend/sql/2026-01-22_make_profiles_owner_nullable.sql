-- Allow public/unowned profiles (e.g. after leaving a scenario)
ALTER TABLE profiles
  ALTER COLUMN owner_user_id DROP NOT NULL;
