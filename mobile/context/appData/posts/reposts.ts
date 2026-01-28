import type { Dispatch, SetStateAction } from "react";
import type { DbV5, Profile, Repost } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { upsertPostsAsync, upsertRepostsAsync, deleteRepostAsync, deletePostCascadeAsync } from "@/data/db/sqliteStore";

type AuthLike = {
  token?: string | null;
};

type Deps = {
  getDb: () => DbV5 | null;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
};

export function createRepostsApi(deps: Deps) {
  const getRepostEventForProfile = (profileId: string, postId: string): Repost | null => {
    const db = deps.getDb();
    if (!db) return null;
    const id = `${String(profileId)}|${String(postId)}`;
    return (db as any).reposts?.[id] ?? null;
  };

  const isPostRepostedByProfileId = (profileId: string, postId: string): boolean => {
    const db = deps.getDb();
    if (!db) return false;
    const id = `${String(profileId)}|${String(postId)}`;
    return !!(db as any).reposts?.[id];
  };

  const isPostRepostedBySelectedProfile = (scenarioId: string, postId: string): boolean => {
    const db = deps.getDb();
    if (!db) return false;
    const sel = (db as any).selectedProfileByScenario?.[String(scenarioId)];
    if (!sel) return false;
    const id = `${String(sel)}|${String(postId)}`;
    return !!(db as any).reposts?.[id];
  };

  const toggleRepost = async (scenarioId: string, postId: string): Promise<void> => {
    const db = deps.getDb();
    if (!db) return;

    const sid = String(scenarioId);
    const pid = String(postId);

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      // backend mode: require selected profile
      const selRaw = (db as any)?.selectedProfileByScenario?.[sid];
      const reposterId = selRaw == null ? "" : String(selRaw);
      if (!reposterId) return;

      const key = `${reposterId}|${pid}`;
      const already = Boolean((db as any)?.reposts?.[key]);

      // Optimistic UI: update local DB immediately so the icon tint + count update instantly.
      // If the backend request fails, we roll back this local change.
      const optimisticNow = new Date().toISOString();
      const optimisticDb = await updateDb((prev) => {
        const reposts = { ...((prev as any).reposts ?? {}) } as any;
        const posts = { ...(prev as any).posts } as any;

        const post = posts[pid];
        const nextDelta = already ? -1 : 1;

        if (already) {
          delete reposts[key];
        } else {
          reposts[key] = {
            id: key,
            scenarioId: sid,
            profileId: reposterId,
            postId: pid,
            createdAt: optimisticNow,
          } as any;
        }

        if (post) {
          posts[pid] = {
            ...post,
            repostCount: Math.max(0, Number((post as any).repostCount ?? 0) + nextDelta),
            updatedAt: optimisticNow,
          } as any;
        }

        return { ...prev, reposts, posts };
      });

      // Keep SQL index in sync for optimistic state BEFORE setState.
      try {
        const postRow = (optimisticDb as any)?.posts?.[pid] ?? null;
        if (postRow) await upsertPostsAsync([postRow]);

        if (!already) {
          await upsertRepostsAsync([
            {
              id: key,
              scenarioId: sid,
              profileId: reposterId,
              postId: pid,
              createdAt: optimisticNow,
            } as any,
          ]);
        } else {
          await deleteRepostAsync(sid, reposterId, pid);
        }
      } catch {
        // ignore
      }

      deps.setState({ isReady: true, db: optimisticDb as any });

      const rollbackOptimistic = async () => {
        const rollbackDb = await updateDb((prev) => {
          const reposts = { ...((prev as any).reposts ?? {}) } as any;
          const posts = { ...(prev as any).posts } as any;

          const post = posts[pid];
          const shouldExist = already;
          const existsNow = Boolean(reposts[key]);

          // Only change what we optimistically changed.
          if (shouldExist && !existsNow) {
            reposts[key] = {
              id: key,
              scenarioId: sid,
              profileId: reposterId,
              postId: pid,
              createdAt: optimisticNow,
            } as any;

            if (post) {
              posts[pid] = {
                ...post,
                repostCount: Math.max(0, Number((post as any).repostCount ?? 0) + 1),
                updatedAt: optimisticNow,
              } as any;
            }
          }

          if (!shouldExist && existsNow) {
            delete reposts[key];

            if (post) {
              posts[pid] = {
                ...post,
                repostCount: Math.max(0, Number((post as any).repostCount ?? 0) - 1),
                updatedAt: optimisticNow,
              } as any;
            }
          }

          return { ...prev, reposts, posts };
        });

        // Best-effort rollback in SQL index BEFORE setState.
        try {
          const postRow = (rollbackDb as any)?.posts?.[pid] ?? null;
          if (postRow) await upsertPostsAsync([postRow]);

          if (already) {
            await upsertRepostsAsync([
              {
                id: key,
                scenarioId: sid,
                profileId: reposterId,
                postId: pid,
                createdAt: optimisticNow,
              } as any,
            ]);
          } else {
            await deleteRepostAsync(sid, reposterId, pid);
          }
        } catch {
          // ignore
        }

        deps.setState({ isReady: true, db: rollbackDb as any });
      };

      let res: Awaited<ReturnType<typeof apiFetch>>;
      try {
        res = await apiFetch({
          path: `/reposts/posts/${encodeURIComponent(pid)}`,
          token,
          init: {
            method: already ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioId: sid, profileId: reposterId }),
          },
        });
      } catch (e) {
        await rollbackOptimistic();
        throw e;
      }

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Repost failed (HTTP ${res.status})`;
        await rollbackOptimistic();

        // If the post no longer exists on the server, our local cache is stale
        // (commonly happens if you switched environments or the post was deleted).
        if (res.status === 404 && /post not found/i.test(msg)) {
          try {
            const prunedDb = await updateDb((prev) => {
              const posts = { ...(prev as any).posts } as any;
              const reposts = { ...((prev as any).reposts ?? {}) } as any;

              delete posts[pid];

              // Remove repost edges pointing at this post.
              for (const k of Object.keys(reposts)) {
                if (k.endsWith(`|${pid}`)) delete reposts[k];
              }

              return { ...prev, posts, reposts };
            });

            try {
              await deletePostCascadeAsync(pid);
            } catch {
              // ignore
            }

            deps.setState({ isReady: true, db: prunedDb as any });
          } catch {
            // ignore
          }

          throw new Error("Post no longer exists.");
        }

        throw new Error(msg);
      }

      const reposted = Boolean((res.json as any)?.reposted);
      const repost = (res.json as any)?.repost;
      const post = (res.json as any)?.post;
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const reposts = { ...((prev as any).reposts ?? {}) } as any;
        const posts = { ...(prev as any).posts } as any;

        if (reposted) {
          reposts[key] = {
            id: String(repost?.id ?? key),
            scenarioId: sid,
            profileId: reposterId,
            postId: pid,
            createdAt: repost?.createdAt ? new Date(repost.createdAt).toISOString() : now,
          } as any;
        } else {
          delete reposts[key];
        }

        if (post && typeof post === "object") {
          const existing = posts[pid] ?? {};
          posts[pid] = {
            ...existing,
            ...post,
            id: String(post?.id ?? pid),
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

        return { ...prev, reposts, posts };
      });

      // Keep SQL index in sync with authoritative result BEFORE setState.
      try {
        const postRow = (nextDb as any)?.posts?.[pid] ?? null;
        if (postRow) await upsertPostsAsync([postRow]);

        if (reposted) {
          const r = (nextDb as any)?.reposts?.[key] ?? null;
          if (r) await upsertRepostsAsync([r]);
        } else {
          await deleteRepostAsync(sid, reposterId, pid);
        }
      } catch {
        // ignore
      }

      deps.setState({ isReady: true, db: nextDb as any });
      return;
    }

    const next = await updateDb((prev) => {
      const selectedProfileId = (prev as any).selectedProfileByScenario?.[sid];
      if (!selectedProfileId) return prev;

      const reposterId = String(selectedProfileId);
      const post = prev.posts[pid];
      if (!post) return prev;

      const key = `${reposterId}|${pid}`;
      const reposts = { ...((prev as any).reposts ?? {}) };

      const already = !!reposts?.[key];
      const now = new Date().toISOString();

      if (already) {
        delete reposts[key];
      } else {
        reposts[key] = {
          id: key,
          scenarioId: sid,
          profileId: reposterId,
          postId: pid,
          createdAt: now,
        } as Repost;
      }

      return {
        ...prev,
        reposts,
        posts: {
          ...prev.posts,
          [pid]: {
            ...post,
            repostCount: Math.max(0, ((post as any).repostCount ?? 0) + (already ? -1 : 1)),
            updatedAt: now,
          } as any,
        },
      };
    });

    // Keep SQL index in sync BEFORE setState.
    try {
      const postRow = (next as any)?.posts?.[pid] ?? null;
      if (postRow) await upsertPostsAsync([postRow]);

      const selectedProfileId = (next as any).selectedProfileByScenario?.[sid];
      const reposterId = selectedProfileId ? String(selectedProfileId) : "";
      if (reposterId) {
        const key = `${reposterId}|${pid}`;
        const r = (next as any)?.reposts?.[key] ?? null;
        if (r) {
          await upsertRepostsAsync([r]);
        } else {
          await deleteRepostAsync(sid, reposterId, pid);
        }
      }
    } catch {
      // ignore
    }

    deps.setState({ isReady: true, db: next as any });
  };

  const listRepostersForPost = async (scenarioId: string, postId: string): Promise<Profile[]> => {
    const db = deps.getDb();
    if (!db) return [];

    const sid = String(scenarioId ?? "").trim();
    const poid = String(postId ?? "").trim();
    if (!sid || !poid) return [];

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const repostsRes = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/reposts`,
        token,
        init: { method: "GET" },
      });

      if (!repostsRes.ok) {
        const msg =
          typeof (repostsRes.json as any)?.error === "string"
            ? String((repostsRes.json as any).error)
            : typeof repostsRes.text === "string" && repostsRes.text.trim().length
              ? repostsRes.text
              : `Load reposts failed (HTTP ${repostsRes.status})`;
        throw new Error(msg);
      }

      const repostsRaw: any[] = Array.isArray(repostsRes.json)
        ? (repostsRes.json as any[])
        : Array.isArray((repostsRes.json as any)?.reposts)
          ? ((repostsRes.json as any).reposts as any[])
          : [];

      const repostsForPost = repostsRaw
        .filter((r) => r && typeof r === "object")
        .filter((r) => String(r.scenarioId ?? r.scenario_id ?? "") === sid)
        .filter((r) => String(r.postId ?? r.post_id ?? "") === poid)
        .sort((a: any, b: any) => String(b.createdAt ?? b.created_at ?? "").localeCompare(String(a.createdAt ?? a.created_at ?? "")));

      const orderedProfileIds: string[] = [];
      const seen = new Set<string>();
      for (const r of repostsForPost) {
        const pid = String(r.profileId ?? r.profile_id ?? "").trim();
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        orderedProfileIds.push(pid);
      }

      let nextDb: any = db;
      const profilesById0 = ((nextDb as any)?.profiles ?? {}) as Record<string, Profile>;
      const missing = orderedProfileIds.filter((pid) => !profilesById0[pid]);

      if (missing.length > 0) {
        const profilesRes = await apiFetch({
          path: `/scenarios/${encodeURIComponent(sid)}/profiles`,
          token,
          init: { method: "GET" },
        });

        if (profilesRes.ok) {
          const rawProfiles: any[] = Array.isArray(profilesRes.json)
            ? (profilesRes.json as any[])
            : Array.isArray((profilesRes.json as any)?.profiles)
              ? ((profilesRes.json as any).profiles as any[])
              : [];

          const profiles: Profile[] = rawProfiles
            .filter((p) => p && typeof p === "object")
            .map((p) => ({
              id: String(p.id ?? ""),
              scenarioId: String(p.scenarioId ?? p.scenario_id ?? sid),
              ownerUserId: String(p.ownerUserId ?? p.owner_user_id ?? ""),
              displayName: String(p.displayName ?? p.display_name ?? ""),
              handle: String(p.handle ?? ""),
              avatarUrl: String(p.avatarUrl ?? p.avatar_url ?? ""),
              headerUrl: p.headerUrl ?? p.header_url ?? undefined,
              bio: p.bio ?? undefined,
              isPublic: p.isPublic ?? p.is_public ?? undefined,
              isPrivate: p.isPrivate ?? p.is_private ?? undefined,
              joinedDate: p.joinedDate ?? p.joined_date ?? undefined,
              location: p.location ?? undefined,
              link: p.link ?? undefined,
              followerCount: p.followerCount ?? p.follower_count ?? undefined,
              followingCount: p.followingCount ?? p.following_count ?? undefined,
              createdAt: String(p.createdAt ?? p.created_at ?? new Date().toISOString()),
              updatedAt: p.updatedAt ?? p.updated_at ?? undefined,
            }))
            .filter((p) => Boolean(p.id));

          nextDb = await updateDb((prev) => {
            const nextProfiles = { ...(prev as any).profiles } as Record<string, Profile>;
            for (const pr of profiles) {
              const existing = nextProfiles[String(pr.id)] ?? {};
              nextProfiles[String(pr.id)] = { ...existing, ...pr } as any;
            }
            return { ...prev, profiles: nextProfiles } as any;
          });

          deps.setState({ isReady: true, db: nextDb as any });
        }
      }

      const profilesById = (((nextDb as any)?.profiles ?? {}) as Record<string, Profile>) ?? {};
      return orderedProfileIds.map((pid) => profilesById[pid]).filter(Boolean);
    }

    const reposts = Object.values(((db as any).reposts ?? {}) as Record<string, Repost>)
      .filter((r) => String((r as any)?.scenarioId ?? "") === sid && String((r as any)?.postId ?? "") === poid)
      .sort((a: any, b: any) => {
        const c = String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
        if (c !== 0) return c;
        return String((b as any)?.profileId ?? "").localeCompare(String((a as any)?.profileId ?? ""));
      });

    const profilesById = (db as any).profiles ?? {};
    const seen = new Set<string>();
    const out: Profile[] = [];
    for (const r of reposts) {
      const pid = String((r as any)?.profileId ?? "").trim();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      const p = profilesById[pid];
      if (p) out.push(p);
    }
    return out;
  };

  return {
    getRepostEventForProfile,
    isPostRepostedByProfileId,
    isPostRepostedBySelectedProfile,
    toggleRepost,
    listRepostersForPost,
  };
}
