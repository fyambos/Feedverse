export type PostRow = {
  id: string;
  scenario_id: string;
  author_profile_id: string;
  text: string;
  image_urls: string[] | null;
  reply_count: number;
  repost_count: number;
  like_count: number;
  parent_post_id: string | null;
  quoted_post_id: string | null;
  inserted_at: Date | string;
  created_at: Date | string;
  post_type: string | null;
  meta: any;
  is_pinned: boolean | null;
  pin_order: number | null;
  updated_at: Date | string | null;
};

export type PostApi = {
  id: string;
  scenarioId: string;
  authorProfileId: string;
  text: string;
  imageUrls: string[];
  replyCount: number;
  repostCount: number;
  likeCount: number;
  parentPostId: string | null;
  quotedPostId: string | null;
  insertedAt: string;
  createdAt: string;
  postType: string;
  meta: any;
  isPinned: boolean;
  pinOrder: number | null;
  updatedAt: string | null;
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

export function mapPostRowToApi(row: PostRow): PostApi {
  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    authorProfileId: String(row.author_profile_id),
    text: String(row.text ?? ""),
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : [],
    replyCount: Number(row.reply_count ?? 0),
    repostCount: Number(row.repost_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    parentPostId: row.parent_post_id ? String(row.parent_post_id) : null,
    quotedPostId: row.quoted_post_id ? String(row.quoted_post_id) : null,
    insertedAt: toIso(row.inserted_at),
    createdAt: toIso(row.created_at),
    postType: String(row.post_type ?? "rp"),
    meta: row.meta ?? null,
    isPinned: Boolean(row.is_pinned),
    pinOrder: row.pin_order == null ? null : Number(row.pin_order),
    updatedAt: row.updated_at == null ? null : toIso(row.updated_at),
  };
}
