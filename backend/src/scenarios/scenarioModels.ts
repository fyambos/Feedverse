export type ScenarioMode = "story" | "campaign";

export interface Scenario {
  id: string;
  name: string;
  cover: string;
  invite_code: string;
  owner_user_id: string;
  description: string | null;
  mode: ScenarioMode;
  gm_user_ids: string[];
  settings: object;
  created_at: Date;
  updated_at: Date | null;
}

export interface CreateScenarioRequest {
  name: string;
  invite_code: string;
  owner_user_id: string;
  description: string | null;
  mode: ScenarioMode;
  gm_user_ids: string[];
  settings: object;
}

export interface CreateScenarioData {
  id: string;
  name: string;
  cover: string;
  invite_code: string;
  owner_user_id: string;
  description: string | null;
  mode: ScenarioMode;
  gm_user_ids: string[];
  settings: Record<string, boolean>;
  created_at: Date;
  updated_at: Date | null;
}

export interface CreateScenarioResponse {
  message: string;
  Scenario: Scenario;
}

export interface UpdateScenarioData {
  id: string;
  name: string;
  cover: string;
  invite_code: string;
  owner_user_id: string;
  description: string | null;
  mode: ScenarioMode;
  gm_user_ids: string[];
  settings: Record<string, boolean>;
  created_at: Date;
  updated_at: Date | null;
}

export interface UpdateScenarioRequest {
  name?: string;
  description?: string;
  invite_code?: string;
}

export interface UpdateScenarioResponse {
  message: string;
  scenario: Scenario;
}

export interface ScenarioPlayer {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
  is_owner: boolean;
}

export interface GetScenarioPlayersResponse {
  players: ScenarioPlayer[];
  count: number;
}
