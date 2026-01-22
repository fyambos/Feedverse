export type ProfilePinRow = {
  profile_id: string;
  scenario_id: string;
  post_id: string;
  created_at: string;
  updated_at: string;
};

export type ProfilePinApi = {
  profileId: string;
  scenarioId: string;
  postId: string;
  createdAt: string;
  updatedAt: string;
};

export function mapProfilePinRowToApi(row: ProfilePinRow): ProfilePinApi {
  return {
    profileId: String(row.profile_id),
    scenarioId: String(row.scenario_id),
    postId: String(row.post_id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}
