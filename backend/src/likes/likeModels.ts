export type LikeRow = {
  id: string;
  scenario_id: string;
  profile_id: string;
  post_id: string;
  created_at: string;
};

export type LikeApi = {
  id: string;
  scenarioId: string;
  profileId: string;
  postId: string;
  createdAt: string;
};

export function mapLikeRowToApi(row: LikeRow): LikeApi {
  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    profileId: String(row.profile_id),
    postId: String(row.post_id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}
