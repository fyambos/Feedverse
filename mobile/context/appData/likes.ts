import type { Dispatch, SetStateAction } from "react";
import type { DbV5, Like } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { upsertPostsAsync, upsertLikesAsync, deleteLikeAsync } from "@/data/db/sqliteStore";

type AuthLike = {
  token?: string | null;
};

type Deps = {
  getDb: () => DbV5 | null;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
};

function likeKeyV1(profileId: string, postId: string) {
  return `${String(profileId)}|${String(postId)}`;
}

function likeKeyV2(scenarioId: string, profileId: string, postId: string) {
  return `${String(scenarioId)}|${String(profileId)}|${String(postId)}`;
}

function makeLikeId() {
  return `like_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getLikesMap(db: DbV5 | null): Record<string, Like> {
  return ((db as any)?.likes ?? {}) as Record<string, Like>;
}

export function createLikesApi(deps: Deps) {
  const toggleLikePost = async (
    scenarioId: string,
    profileId: string,
    postId: string,
  ): Promise<{ ok: boolean; liked: boolean }> => {
    const db = deps.getDb();

    const sid = String(scenarioId ?? "").trim();
    const pid = String(profileId ?? "").trim();
    const poid = String(postId ?? "").trim();
    if (!sid || !pid || !poid) {
      return { ok: false, liked: false };
    }

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      // backend mode
      const likesMap = getLikesMap(db);
      const k2 = likeKeyV2(sid, pid, poid);
      const k1 = likeKeyV1(pid, poid);
      const already =
        Boolean(likesMap[k2]) ||
        (Boolean(likesMap[k1]) && String((likesMap[k1] as any)?.scenarioId ?? "") === sid);

      const res = await apiFetch({
        path: `/likes/posts/${encodeURIComponent(poid)}`,
        token,
        init: {
          method: already ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: sid, profileId: pid }),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Like failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const liked = Boolean((res.json as any)?.liked);
      const post = (res.json as any)?.post;
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;
        const posts = { ...(prev as any).posts } as any;

        // Remove any old keys (v1/v2) for this profile+post in this scenario
        const k2 = likeKeyV2(sid, pid, poid);
        const k1 = likeKeyV1(pid, poid);
        if (likes[k2]) delete likes[k2];
        if (likes[k1] && String((likes[k1] as any)?.scenarioId ?? "") === sid) delete likes[k1];

        if (liked) {
          likes[k2] = {
            id: String((res.json as any)?.like?.id ?? k2),
            scenarioId: sid,
            profileId: pid,
            postId: poid,
            createdAt: (res.json as any)?.like?.createdAt
              ? new Date((res.json as any).like.createdAt).toISOString()
              : now,
          } as any;
        }

        if (post && typeof post === "object") {
          const existing = posts[poid] ?? {};
          posts[poid] = {
            ...existing,
            ...post,
            id: String(post?.id ?? poid),
            scenarioId: String(post?.scenarioId ?? post?.scenario_id ?? sid),
            authorProfileId: String(post?.authorProfileId ?? post?.author_profile_id ?? existing?.authorProfileId ?? ""),
            authorUserId:
              String(post?.authorUserId ?? post?.author_user_id ?? existing?.authorUserId ?? "").trim() || undefined,
            text: String(post?.text ?? existing?.text ?? ""),
            imageUrls: Array.isArray(post?.imageUrls ?? post?.image_urls)
              ? (post?.imageUrls ?? post?.image_urls).map(String)
              : (existing?.imageUrls ?? []),
            replyCount: Number(post?.replyCount ?? post?.reply_count ?? existing?.replyCount ?? 0),
            repostCount: Number(post?.repostCount ?? post?.repost_count ?? existing?.repostCount ?? 0),
            likeCount: Number(post?.likeCount ?? post?.like_count ?? existing?.likeCount ?? 0),
            parentPostId: post?.parentPostId ?? post?.parent_post_id ?? existing?.parentPostId,
            quotedPostId: post?.quotedPostId ?? post?.quoted_post_id ?? existing?.quotedPostId,
            insertedAt: post?.insertedAt
              ? new Date(post.insertedAt).toISOString()
              : post?.inserted_at
                ? new Date(post.inserted_at).toISOString()
                : (existing?.insertedAt ?? now),
            createdAt: post?.createdAt
              ? new Date(post.createdAt).toISOString()
              : post?.created_at
                ? new Date(post.created_at).toISOString()
                : (existing?.createdAt ?? now),
            updatedAt: post?.updatedAt
              ? new Date(post.updatedAt).toISOString()
              : post?.updated_at
                ? new Date(post.updated_at).toISOString()
                : now,
            postType: post?.postType ?? post?.post_type ?? existing?.postType,
            meta: post?.meta ?? existing?.meta,
            isPinned: post?.isPinned ?? post?.is_pinned ?? existing?.isPinned,
            pinOrder: post?.pinOrder ?? post?.pin_order ?? existing?.pinOrder,
          } as any;
        }

        return { ...prev, likes, posts } as any;
      });

      // Keep SQL index in sync BEFORE setState so SQL-backed paging sees the update.
      try {
        const postRow = (nextDb as any)?.posts?.[poid] ?? null;
        if (postRow) await upsertPostsAsync([postRow]);

        if (liked) {
          const row = ((nextDb as any)?.likes ?? {})?.[likeKeyV2(sid, pid, poid)] ?? null;
          if (row) await upsertLikesAsync([row]);
        } else {
          await deleteLikeAsync(sid, pid, poid);
        }
      } catch {
        // ignore
      }

      deps.setState({ isReady: true, db: nextDb as any });
      return { ok: true, liked };
    }

    const now = new Date().toISOString();

    const nextDb = await updateDb((prev) => {
      const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;
      const posts = { ...prev.posts };

      const post = posts[poid];
      if (!post) {
        return prev;
      }

      // ensure callers don't accidentally like across scenarios
      if (String((post as any).scenarioId ?? "") !== sid) {
        return prev;
      }

      const k2 = likeKeyV2(sid, pid, poid);
      const k1 = likeKeyV1(pid, poid);

      const already =
        Boolean(likes[k2]) ||
        (Boolean(likes[k1]) && String((likes[k1] as any)?.scenarioId ?? "") === sid);

      if (likes[k2]) delete likes[k2];
      if (likes[k1] && String((likes[k1] as any)?.scenarioId ?? "") === sid) delete likes[k1];

      if (!already) {
        likes[k2] = {
          id: makeLikeId(),
          scenarioId: sid,
          profileId: pid,
          postId: poid,
          createdAt: now,
        } as Like;
      }

      posts[poid] = {
        ...post,
        likeCount: Math.max(0, Number((post as any).likeCount ?? 0) + (already ? -1 : 1)),
        updatedAt: now,
      } as any;

      return { ...prev, likes, posts };
    });

    const likesMap = (nextDb as any)?.likes ?? {};
    const k2 = likeKeyV2(sid, pid, poid);
    const k1 = likeKeyV1(pid, poid);

    const liked =
      Boolean(likesMap[k2]) ||
      (Boolean(likesMap[k1]) && String(likesMap[k1]?.scenarioId ?? "") === sid);

    // Keep SQL index in sync BEFORE setState so SQL-backed paging sees the update.
    try {
      const postRow = (nextDb as any)?.posts?.[poid] ?? null;
      if (postRow) await upsertPostsAsync([postRow]);

      if (liked) {
        const row = (likesMap as any)?.[k2] ?? (likesMap as any)?.[k1] ?? null;
        if (row) await upsertLikesAsync([row]);
      } else {
        await deleteLikeAsync(sid, pid, poid);
      }
    } catch {
      // ignore
    }

    deps.setState({ isReady: true, db: nextDb as any });
    return { ok: true, liked };
  };

  const toggleLike = async (scenarioId: string, postId: string): Promise<void> => {
    const db = deps.getDb();
    if (!db) return;
    const sid = String(scenarioId);
    const poid = String(postId);

    const selRaw = (db as any).selectedProfileByScenario?.[sid];
    const sel = selRaw == null ? "" : String(selRaw);
    if (!sel || sel === "null" || sel === "undefined") return;

    await toggleLikePost(sid, sel, poid);
  };

  const isPostLikedByProfile = (profileId: string, postId: string): boolean => {
    const db = deps.getDb();
    if (!db) return false;
    const pid = String(profileId);
    const poid = String(postId);

    // no scenarioId in signature => scan rows (safe + correct)
    for (const li of Object.values(getLikesMap(db))) {
      if (String((li as any)?.profileId ?? "") !== pid) continue;
      if (String((li as any)?.postId ?? "") !== poid) continue;
      return true;
    }
    return false;
  };

  const listLikedPostIdsForProfile = (scenarioId: string, profileId: string): string[] => {
    const db = deps.getDb();
    if (!db) return [];
    const sid = String(scenarioId);
    const pid = String(profileId);

    const out: string[] = [];
    for (const li of Object.values(getLikesMap(db))) {
      if (String((li as any).scenarioId) !== sid) continue;
      if (String((li as any).profileId) !== pid) continue;
      out.push(String((li as any).postId));
    }
    return out;
  };

  const isPostLikedBySelectedProfile = (scenarioId: string, postId: string): boolean => {
    const db = deps.getDb();
    if (!db) return false;
    const sid = String(scenarioId);
    const selRaw = (db as any).selectedProfileByScenario?.[sid];
    const sel = selRaw == null ? "" : String(selRaw);
    if (!sel || sel === "null" || sel === "undefined") return false;

    const poid = String(postId);
    const likes = getLikesMap(db);

    const k2 = likeKeyV2(sid, sel, poid);
    if (likes[k2]) return true;

    const k1 = likeKeyV1(sel, poid);
    return Boolean(likes[k1]) && String((likes[k1] as any)?.scenarioId ?? "") === sid;
  };

  return {
    toggleLikePost,
    toggleLike,
    isPostLikedByProfile,
    listLikedPostIdsForProfile,
    isPostLikedBySelectedProfile,
  };
}
