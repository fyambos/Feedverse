export interface ScenarioRow {
  id: string;
  name?: string;
  cover?: string;
  invite_code?: string;
  owner_user_id?: string;
  description?: string;
  mode?: string;
  gm_user_ids?: unknown;
  player_ids?: unknown;
  tags?: unknown;
  settings?: unknown;
  created_at?: Date | string;
  updated_at?: Date | string;

  // allow extra DB columns without typing every field
  [key: string]: unknown;
}
