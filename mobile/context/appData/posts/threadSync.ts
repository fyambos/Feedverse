import { apiFetch } from "@/lib/api/apiClient";
import { markSeenPostsAsync, upsertPostsAsync } from "@/data/db/sqliteStore";
import { updateDb } from "@/data/db/storage";

type SeenRef = { current: { byScenario: Record<string, Record<string, true>> } };

type AuthLike = {
  isReady: boolean;
  token?: string | null;
};

type SetStateLike = (next: { isReady: boolean; db: any }) => void;

export async function syncPostThreadForScenarioImpl(args: {
  scenarioId: string;
  rootPostId: string;
  db: any;
  auth: AuthLike;
  isUuidLike: (id: string) => boolean;
  serverSeenPostsRef: SeenRef;
  setState: SetStateLike;
}): Promise<boolean> {
  const sid = String(args.scenarioId ?? "").trim();
  const pid = String(args.rootPostId ?? "").trim();
  if (!sid || !pid) return false;
  if (!args.db) return false;
  if (!args.auth?.isReady) return false;

  // Backend mode scenario ids are UUIDs; avoid calling the server for local/imported scenarios.
  if (!args.isUuidLike(sid)) return false;

  const token = String(args.auth?.token ?? "").trim();
  const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!token || !baseUrl) return false;

  try {
    const res = await apiFetch({
      path: `/scenarios/${encodeURIComponent(sid)}/posts/${encodeURIComponent(pid)}/thread`,
      token,
    });
    if (!res.ok) return false;

    const rows: any[] = Array.isArray((res.json as any)?.items)
      ? ((res.json as any).items as any[])
      : Array.isArray(res.json)
        ? (res.json as any[])
        : [];

    if (rows.length === 0) return false;

    const seen = (args.serverSeenPostsRef.current.byScenario[sid] ??= {});
    const seenIds: string[] = [];
    for (const raw of rows) {
      const id = String(raw?.id ?? "").trim();
      if (!id) continue;
      seen[id] = true;
      seenIds.push(id);
    }

    const now = new Date().toISOString();

    const nextDb = await updateDb((prev) => {
      const posts = { ...(prev.posts ?? {}) } as any;

      for (const raw of rows) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;

        const existing = posts[id] ?? {};

        posts[id] = {
          ...existing,
          id,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? existing?.scenarioId ?? sid),
          authorProfileId: String(raw?.authorProfileId ?? raw?.author_profile_id ?? existing?.authorProfileId ?? ""),
          authorUserId: String(raw?.authorUserId ?? raw?.author_user_id ?? existing?.authorUserId ?? "").trim() || undefined,
          text: String(raw?.text ?? existing?.text ?? ""),
          imageUrls: Array.isArray(raw?.imageUrls ?? raw?.image_urls)
            ? (raw?.imageUrls ?? raw?.image_urls).map(String)
            : (existing?.imageUrls ?? []),
          replyCount: Number(raw?.replyCount ?? raw?.reply_count ?? existing?.replyCount ?? 0),
          repostCount: Number(raw?.repostCount ?? raw?.repost_count ?? existing?.repostCount ?? 0),
          likeCount: Number(raw?.likeCount ?? raw?.like_count ?? existing?.likeCount ?? 0),
          parentPostId: raw?.parentPostId ?? raw?.parent_post_id ?? existing?.parentPostId,
          quotedPostId: raw?.quotedPostId ?? raw?.quoted_post_id ?? existing?.quotedPostId,
          insertedAt: raw?.insertedAt
            ? new Date(raw.insertedAt).toISOString()
            : raw?.inserted_at
              ? new Date(raw.inserted_at).toISOString()
              : (existing?.insertedAt ?? now),
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : (existing?.createdAt ?? now),
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : now,
          postType: raw?.postType ?? raw?.post_type ?? existing?.postType,
          meta: raw?.meta ?? existing?.meta,
          isPinned: raw?.isPinned ?? raw?.is_pinned ?? existing?.isPinned,
          pinOrder: raw?.pinOrder ?? raw?.pin_order ?? existing?.pinOrder,
        } as any;
      }

      return { ...prev, posts } as any;
    });

    try {
      if (seenIds.length > 0) await markSeenPostsAsync(sid, seenIds);

      const upserts: any[] = [];
      for (const raw of rows) {
        const id = String(raw?.id ?? "").trim();
        const p = id ? (nextDb as any)?.posts?.[id] : null;
        if (p) upserts.push(p);
      }
      if (upserts.length > 0) await upsertPostsAsync(upserts as any);
    } catch {
      // best-effort
    }

    args.setState({ isReady: true, db: nextDb as any });
    return true;
  } catch {
    return false;
  }
}
