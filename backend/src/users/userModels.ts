import { ScenarioMode } from "../scenarios/scenarioModels";

export interface UserSettings {
  showTimestamps?: boolean;
  darkMode?: "light" | "dark" | "system";
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  settings: UserSettings;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  is_deleted: boolean;
  // last_login: Date | null;
}

export interface GetUser {
  User: User;
}

export interface UserScenario {
  id: string;
  name: string;
  cover: string;
  invite_code: string;
  owner_user_id: string;
  description: string | null;
  mode: ScenarioMode;
  is_owner: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export interface GetUserScenariosResponse {
  scenarios: UserScenario[];
  count: number;
}

export interface UpdateUserData {
  username?: string;
  avatar_url?: string;
  settings?: UserSettings;
  updated_at: Date;
}

export interface UpdateUserRequest {
  username?: string;
  settings?: UserSettings;
}

export interface UpdateUserResponse {
  message: string;
  user: User;
}
