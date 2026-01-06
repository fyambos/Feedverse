export type RepostRow = {
  id: string;
  scenario_id: string;
  profile_id: string;
  post_id: string;
  created_at: Date | string;
};

export type RepostApi = {
  id: string;
  scenarioId: string;
  profileId: string;
  postId: string;
  createdAt: string;
};

function toIso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.valueOf()) ? d.toISOString() : new Date().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isFinite(d.valueOf()) ? d.toISOString() : new Date().toISOString();
}

export function mapRepostRowToApi(row: RepostRow): RepostApi {
  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    profileId: String(row.profile_id),
    postId: String(row.post_id),
    createdAt: toIso(row.created_at),
  };
}
