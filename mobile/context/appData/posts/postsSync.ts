import { apiFetch } from "@/lib/api/apiClient";
import { markSeenPostsAsync, replaceScenarioLikesAsync, replaceScenarioRepostsAsync, upsertPostsAsync } from "@/data/db/sqliteStore";
import { updateDb } from "@/data/db/storage";
import type { Like } from "@/data/db/schema";

type PostsSyncRef = {
  current: {
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
    backfillCursorByScenario: Record<string, string | null>;
  };
};

type SeenRef = { current: { byScenario: Record<string, Record<string, true>> } };

type AuthLike = {
  isReady: boolean;
  token?: string | null;
};

type SetStateLike = (next: { isReady: boolean; db: any }) => void;

type LikeKeyV2 = (scenarioId: string, profileId: string, postId: string) => string;

export function createSchedulePostsSync(args: {
  getDb: () => any;
  auth: AuthLike;
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
  postsSyncRef: PostsSyncRef;
  serverSeenPostsRef: SeenRef;
  setState: SetStateLike;
  likeKeyV2: LikeKeyV2;
}) {
  return function schedulePostsSync(scenarioId: string) {
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    const db = args.getDb();
    if (!db) return;
    if (!args.auth.isReady) return;

    if (args.backendEnabled && !args.isUuidLike(sid)) return; // do not sync local-only scenarios in backend mode

    const token = String(args.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (!token || !baseUrl) return;

    const nowMs = Date.now();
    const lastAt = args.postsSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
    const inFlight = Boolean(args.postsSyncRef.current.inFlightByScenario[sid]);

    // throttle: keep it lightweight (feed calls this often)
    if (inFlight) return;
    if (nowMs - lastAt < 2500) return;

    args.postsSyncRef.current.inFlightByScenario[sid] = true;
    args.postsSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

    (async () => {
      const [repostsRes, likesRes] = await Promise.all([
        apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/reposts`, token }),
        apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/likes`, token }),
      ]);

      const repostRows = repostsRes.ok && Array.isArray(repostsRes.json) ? (repostsRes.json as any[]) : [];
      const likeRows = likesRes.ok && Array.isArray(likesRes.json) ? (likesRes.json as any[]) : [];

      const pageLimit = 200;
      const allRows: any[] = [];

      // 1) Always pull the most-recently-updated page (catches new posts + edits + count changes).
      const topRes = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/posts?limit=${encodeURIComponent(String(pageLimit))}`,
        token,
      });

      if (topRes.ok) {
        const topItems = Array.isArray((topRes.json as any)?.items)
          ? ((topRes.json as any).items as any[])
          : Array.isArray(topRes.json)
            ? (topRes.json as any[])
            : [];
        allRows.push(...topItems);

        // Initialize backfill cursor if we haven't started yet.
        if (!(sid in args.postsSyncRef.current.backfillCursorByScenario)) {
          const nextCursor =
            typeof (topRes.json as any)?.nextCursor === "string" ? String((topRes.json as any).nextCursor) : null;
          args.postsSyncRef.current.backfillCursorByScenario[sid] = nextCursor;
        }
      }

      // 2) Backfill one additional page of older posts per tick (until cursor becomes null).
      const backCursor = args.postsSyncRef.current.backfillCursorByScenario[sid];
      if (typeof backCursor === "string" && backCursor.trim()) {
        const backRes = await apiFetch({
          path: `/scenarios/${encodeURIComponent(sid)}/posts?limit=${encodeURIComponent(String(pageLimit))}&cursor=${encodeURIComponent(backCursor)}`,
          token,
        });
        if (backRes.ok) {
          const backItems = Array.isArray((backRes.json as any)?.items)
            ? ((backRes.json as any).items as any[])
            : Array.isArray(backRes.json)
              ? (backRes.json as any[])
              : [];
          allRows.push(...backItems);

          const nextCursor =
            typeof (backRes.json as any)?.nextCursor === "string" ? String((backRes.json as any).nextCursor) : null;
          args.postsSyncRef.current.backfillCursorByScenario[sid] = nextCursor;
        }
      }

      if (allRows.length === 0 && repostRows.length === 0 && likeRows.length === 0) return;

      // mark server-seen posts for filtering (server post ids may be non-uuid)
      const seen = (args.serverSeenPostsRef.current.byScenario[sid] ??= {});
      const seenIds: string[] = [];
      for (const raw of allRows) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;
        seen[id] = true;
        seenIds.push(id);
      }

      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const posts = { ...(prev.posts ?? {}) } as any;
        const reposts = { ...((prev as any).reposts ?? {}) } as any;
        const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;

        for (const raw of allRows) {
          const id = String(raw?.id ?? "").trim();
          if (!id) continue;

          const existing = posts[id] ?? {};

          posts[id] = {
            ...existing,
            id,
            scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? existing?.scenarioId ?? sid),
            authorProfileId: String(raw?.authorProfileId ?? raw?.author_profile_id ?? existing?.authorProfileId ?? ""),
            authorUserId:
              String(raw?.authorUserId ?? raw?.author_user_id ?? existing?.authorUserId ?? "").trim() || undefined,
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

        // Merge repost events for this scenario.
        // Keying matches local convention: `${profileId}|${postId}`.
        for (const r of repostRows) {
          const profileId = String(r?.profileId ?? r?.profile_id ?? "").trim();
          const postId = String(r?.postId ?? r?.post_id ?? "").trim();
          const scenarioId = String(r?.scenarioId ?? r?.scenario_id ?? sid).trim();
          if (!profileId || !postId) continue;
          if (scenarioId !== sid) continue;
          const key = `${profileId}|${postId}`;
          reposts[key] = {
            id: String(r?.id ?? key),
            scenarioId,
            profileId,
            postId,
            createdAt: r?.createdAt
              ? new Date(r.createdAt).toISOString()
              : r?.created_at
                ? new Date(r.created_at).toISOString()
                : now,
          } as any;
        }

        // Replace likes for this scenario (server is source of truth in backend mode).
        for (const [k, li] of Object.entries(likes)) {
          if (String((li as any)?.scenarioId ?? "") === sid) {
            delete likes[k];
          }
        }

        for (const li of likeRows) {
          const profileId = String(li?.profileId ?? li?.profile_id ?? "").trim();
          const postId = String(li?.postId ?? li?.post_id ?? "").trim();
          const scenarioId = String(li?.scenarioId ?? li?.scenario_id ?? sid).trim();
          if (!profileId || !postId) continue;
          if (scenarioId !== sid) continue;

          const key = args.likeKeyV2(sid, profileId, postId);
          likes[key] = {
            id: String(li?.id ?? key),
            scenarioId: sid,
            profileId,
            postId,
            createdAt: li?.createdAt
              ? new Date(li.createdAt).toISOString()
              : li?.created_at
                ? new Date(li.created_at).toISOString()
                : now,
          } as any;
        }

        return { ...prev, posts, reposts, likes };
      });

      // Keep SQL index in sync BEFORE setState so SQL-backed paging sees the update.
      try {
        if (seenIds.length > 0) {
          await markSeenPostsAsync(sid, seenIds);
        }

        if (allRows.length > 0) {
          const upserts: any[] = [];
          for (const raw of allRows) {
            const id = String(raw?.id ?? "").trim();
            const p = id ? (nextDb as any)?.posts?.[id] : null;
            if (p) upserts.push(p);
          }
          if (upserts.length > 0) await upsertPostsAsync(upserts as any);
        }

        if (Array.isArray(likeRows)) {
          const mapped = likeRows
            .map((li: any) => {
              const profileId = String(li?.profileId ?? li?.profile_id ?? "").trim();
              const postId = String(li?.postId ?? li?.post_id ?? "").trim();
              const scenarioId = String(li?.scenarioId ?? li?.scenario_id ?? sid).trim();
              if (!profileId || !postId || scenarioId !== sid) return null;
              return {
                id: String(li?.id ?? "") || null,
                scenarioId: sid,
                profileId,
                postId,
                createdAt: li?.createdAt
                  ? new Date(li.createdAt).toISOString()
                  : li?.created_at
                    ? new Date(li.created_at).toISOString()
                    : now,
              } as any;
            })
            .filter(Boolean);
          await replaceScenarioLikesAsync(sid, mapped as any);
        }

        if (Array.isArray(repostRows)) {
          const mapped = repostRows
            .map((r: any) => {
              const profileId = String(r?.profileId ?? r?.profile_id ?? "").trim();
              const postId = String(r?.postId ?? r?.post_id ?? "").trim();
              const scenarioId = String(r?.scenarioId ?? r?.scenario_id ?? sid).trim();
              if (!profileId || !postId || scenarioId !== sid) return null;
              return {
                id: String(r?.id ?? `${profileId}|${postId}`),
                scenarioId: sid,
                profileId,
                postId,
                createdAt: r?.createdAt
                  ? new Date(r.createdAt).toISOString()
                  : r?.created_at
                    ? new Date(r.created_at).toISOString()
                    : now,
              } as any;
            })
            .filter(Boolean);
          await replaceScenarioRepostsAsync(sid, mapped as any);
        }
      } catch {
        // ignore
      }

      args.setState({ isReady: true, db: nextDb as any });
    })()
      .catch(() => {
        // ignore
      })
      .finally(() => {
        args.postsSyncRef.current.inFlightByScenario[sid] = false;
      });
  };
}
