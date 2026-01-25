export type ProfileRow = {
  id: string;
  scenario_id: string;
  owner_user_id: string | null;
  display_name: string;
  handle: string;
  avatar_url: string;
  header_url: string | null;
  bio: string | null;
  is_public: boolean | null;
  is_private: boolean | null;
  joined_date: Date | string | null;
  location: string | null;
  link: string | null;
  follower_count: number | null;
  following_count: number | null;
  created_at: Date | string;
  updated_at: Date | string | null;
};

export type ProfileApi = {
  id: string;
  scenarioId: string;
  ownerUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  headerUrl?: string;
  bio?: string;
  isPublic?: boolean;
  isPrivate?: boolean;
  joinedDate?: string;
  location?: string;
  link?: string;
  followerCount?: number;
  followingCount?: number;
  createdAt: string;
  updatedAt?: string;
  owner?: {
    id: string;
    username?: string;
    avatarUrl?: string | null;
  };
};

export function toIso(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  try {
    return new Date(v).toISOString();
  } catch {
    return undefined;
  }
}

export function mapProfileRowToApi(row: ProfileRow): ProfileApi {
  const createdAt = toIso(row.created_at) ?? new Date().toISOString();
  const updatedAt = toIso(row.updated_at);

  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : "",
    displayName: String(row.display_name ?? ""),
    handle: String(row.handle ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    headerUrl: row.header_url != null ? String(row.header_url) : undefined,
    bio: row.bio != null ? String(row.bio) : undefined,
    isPublic: row.is_public != null ? Boolean(row.is_public) : undefined,
    isPrivate: row.is_private != null ? Boolean(row.is_private) : undefined,
    joinedDate: toIso(row.joined_date),
    location: row.location != null ? String(row.location) : undefined,
    link: row.link != null ? String(row.link) : undefined,
    followerCount: row.follower_count != null ? Number(row.follower_count) : undefined,
    followingCount: row.following_count != null ? Number(row.following_count) : undefined,
    createdAt,
    updatedAt,
  };
}
