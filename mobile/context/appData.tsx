// mobile/context/appData.tsx
import React from "react";
import type { DbV4, Post, Profile, Scenario, User, Repost, UserSettings } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";

type AppDataState = {
  isReady: boolean;
  db: DbV4 | null;
};

type PostCursor = string; // `${insertedAt}|${id}`

type PostsPageArgs = {
  scenarioId: string;
  limit?: number;
  cursor?: PostCursor | null;
  filter?: (p: Post) => boolean;
  includeReplies?: boolean;
};

type PostsPageResult = {
  items: Post[];
  nextCursor: PostCursor | null;
};

// profile feed (posts + reposts ordered by activity time)
export type ProfileFeedKind = "post" | "repost";

export type ProfileFeedItem = {
  kind: ProfileFeedKind;
  post: Post;
  activityAt: string; // used for ordering + cursor
  reposterProfileId?: string; // only if kind === "repost"
};

type FeedCursor = string; // `${activityAt}|${kind}|${postId}|${reposterId}`

type ProfileFeedPageArgs = {
  scenarioId: string;
  profileId: string; // viewing profile (whose page we are building)
  tab: "posts" | "media" | "replies" | "likes";
  limit?: number;
  cursor?: FeedCursor | null;
};

type ProfileFeedPageResult = {
  items: ProfileFeedItem[];
  nextCursor: FeedCursor | null;
};

type AppDataApi = {
  // selectors
  getUserById: (id: string) => User | null;
  listUsers: () => User[];

  getScenarioById: (id: string) => Scenario | null;
  listScenarios: () => Scenario[];

  getProfileById: (id: string) => Profile | null;
  getProfileByHandle: (scenarioId: string, handle: string) => Profile | null;
  listProfilesForScenario: (scenarioId: string) => Profile[];

  getPostById: (id: string) => Post | null;
  listPostsForScenario: (scenarioId: string) => Post[];
  listRepliesForPost: (postId: string) => Post[];

  listPostsPage: (args: PostsPageArgs) => PostsPageResult;

  listProfileFeedPage: (args: ProfileFeedPageArgs) => ProfileFeedPageResult;

  getSelectedProfileId: (scenarioId: string) => string | null;

  // actions
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  upsertProfile: (p: Profile) => Promise<void>;
  upsertPost: (p: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;

  toggleLike: (scenarioId: string, postId: string) => Promise<void>;
  isPostLikedBySelectedProfile: (scenarioId: string, postId: string) => boolean;

  // repost
  toggleRepost: (scenarioId: string, postId: string) => Promise<void>;
  isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => boolean;

  // (optional) helper: did THIS profile repost this post?
  isPostRepostedByProfileId: (profileId: string, postId: string) => boolean;
  getRepostEventForProfile: (profileId: string, postId: string) => Repost | null;
};

const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function makePostCursor(p: Post): PostCursor {
  return `${String(p.insertedAt)}|${String(p.id)}`;
}

function sortDescByCreatedAtThenId(a: Post, b: Post) {
  const c = String(b.createdAt).localeCompare(String(a.createdAt));
  if (c !== 0) return c;
  return String(b.id).localeCompare(String(a.id));
}

function sortAscByCreatedAtThenId(a: Post, b: Post) {
  const c = String(a.createdAt).localeCompare(String(b.createdAt));
  if (c !== 0) return c;
  return String(a.id).localeCompare(String(b.id));
}

function hasAnyMedia(p: any) {
  const urls = p?.imageUrls;
  if (Array.isArray(urls) && urls.length > 0) return true;
  const single = p?.imageUrl;
  if (typeof single === "string" && single.length > 0) return true;
  const media = p?.media;
  if (Array.isArray(media) && media.length > 0) return true;
  return false;
}

function makeFeedCursor(item: ProfileFeedItem): FeedCursor {
  const rep = item.reposterProfileId ? String(item.reposterProfileId) : "";
  return `${String(item.activityAt)}|${String(item.kind)}|${String(item.post.id)}|${rep}`;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppDataState>({
    isReady: false,
    db: null,
  });

  React.useEffect(() => {
    (async () => {
      const existing = await readDb();
      const db = await seedDbIfNeeded(existing);
      setState({ isReady: true, db });
    })();
  }, []);

  const db = state.db;

  const api = React.useMemo<AppDataApi>(() => {
    return {
      // --- users
      getUserById: (id) => (db ? db.users[String(id)] ?? null : null),
      listUsers: () => (db ? Object.values(db.users) : []),

      // --- scenarios
      getScenarioById: (id) => (db ? db.scenarios[String(id)] ?? null : null),
      listScenarios: () => (db ? Object.values(db.scenarios) : []),

      // --- profiles
      getProfileById: (id) => (db ? db.profiles[String(id)] ?? null : null),

      getProfileByHandle: (scenarioId, handle) => {
        if (!db) return null;
        const needle = normalizeHandle(handle);
        for (const p of Object.values(db.profiles)) {
          if (p.scenarioId === String(scenarioId) && normalizeHandle(p.handle) === needle) return p;
        }
        return null;
      },

      listProfilesForScenario: (scenarioId) =>
        db ? Object.values(db.profiles).filter((p) => p.scenarioId === String(scenarioId)) : [],

      // --- posts
      getPostById: (id) => (db ? db.posts[String(id)] ?? null : null),

      listPostsForScenario: (scenarioId) =>
        db
          ? Object.values(db.posts)
              .filter((p) => p.scenarioId === String(scenarioId) && !p.parentPostId)
              .sort(sortDescByCreatedAtThenId)
          : [],

      listRepliesForPost: (postId) =>
        db
          ? Object.values(db.posts)
              .filter((p) => p.parentPostId === String(postId))
              .sort(sortAscByCreatedAtThenId)
          : [],

      // generic paged posts (feed)
      listPostsPage: ({ scenarioId, limit = 15, cursor, filter, includeReplies = false }) => {
        if (!db) return { items: [], nextCursor: null };

        let items = Object.values(db.posts).filter((p) => p.scenarioId === String(scenarioId));

        if (!includeReplies) items = items.filter((p) => !p.parentPostId);
        if (filter) items = items.filter(filter);

        items.sort(sortDescByCreatedAtThenId);

        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((p) => makePostCursor(p) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makePostCursor(page[page.length - 1]) : null;

        return { items: page, nextCursor: next };
      },

      // profile feed page (posts tab shows authored posts + repost events, ordered by activityAt)
      listProfileFeedPage: ({ scenarioId, profileId, tab, limit = 15, cursor }) => {
        if (!db) return { items: [], nextCursor: null };

        const sid = String(scenarioId);
        const pid = String(profileId);

        const posts = Object.values(db.posts).filter((p) => p.scenarioId === sid);

        const authoredPosts = posts.filter((p) => String(p.authorProfileId) === pid);

        // likes tab depends on profile.likedPostIds
        const profile = db.profiles[pid];
        const likedSet = new Set<string>((profile?.likedPostIds ?? []).map(String));

        // helper: find repost events by this profile
        const repostEvents = Object.values(db.reposts ?? {}).filter(
          (r) => String(r.scenarioId) === sid && String(r.profileId) === pid
        );

        // build feed candidates
        const items: ProfileFeedItem[] = [];

        if (tab === "posts") {
          // authored posts as activity = post.createdAt (or insertedAt? keep createdAt for narrative)
          for (const p of authoredPosts.filter((p) => !p.parentPostId)) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }

          // reposts as activity = repost.createdAt
          for (const r of repostEvents) {
            const post = db.posts[String(r.postId)];
            if (!post) continue;
            // typically do not show replies in profile “posts” tab
            if (post.parentPostId) continue;

            items.push({
              kind: "repost",
              post,
              activityAt: String(r.createdAt),
              reposterProfileId: pid,
            });
          }
        }

        if (tab === "media") {
          for (const p of authoredPosts.filter((p) => !p.parentPostId && hasAnyMedia(p))) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        if (tab === "replies") {
          for (const p of authoredPosts.filter((p) => !!p.parentPostId)) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        if (tab === "likes") {
          for (const p of posts) {
            if (!likedSet.has(String(p.id))) continue;
            // likes are better ordered by "when liked", but we don't store it yet, so fallback to post.createdAt
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        // sort by activityAt desc, then kind, then post.id (stable)
        items.sort((a, b) => {
          const c = String(b.activityAt).localeCompare(String(a.activityAt));
          if (c !== 0) return c;
          const k = String(b.kind).localeCompare(String(a.kind));
          if (k !== 0) return k;
          return String(b.post.id).localeCompare(String(a.post.id));
        });

        // cursor (start after)
        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((it) => makeFeedCursor(it) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makeFeedCursor(page[page.length - 1]) : null;

        return { items: page, nextCursor: next };
      },

      // --- selection
      getSelectedProfileId: (scenarioId) => {
        if (!db) return null;
        return db.selectedProfileByScenario[String(scenarioId)] ?? null;
      },

      // --- actions
      setSelectedProfileId: async (scenarioId, profileId) => {
        const next = await updateDb((prev) => ({
          ...prev,
          selectedProfileByScenario: {
            ...prev.selectedProfileByScenario,
            [String(scenarioId)]: String(profileId),
          },
        }));
        setState({ isReady: true, db: next as any });
      },

      upsertProfile: async (p) => {
        const id = String(p.id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.profiles[id];
          const createdAt = existing?.createdAt ?? p.createdAt ?? now;

          return {
            ...prev,
            profiles: {
              ...prev.profiles,
              [id]: {
                ...(existing ?? {}),
                ...p,
                id,
                createdAt,
                joinedDate: p.joinedDate ?? existing?.joinedDate ?? createdAt,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      upsertPost: async (p) => {
        const id = String(p.id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.posts[id];

          const insertedAt = existing?.insertedAt ?? p.insertedAt ?? now; // stable
          const createdAt = p.createdAt ?? existing?.createdAt ?? now; // editable

          return {
            ...prev,
            posts: {
              ...prev.posts,
              [id]: {
                ...(existing ?? {}),
                ...p,
                id,
                insertedAt,
                createdAt,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      updateUserSettings: async (userId: string, settings: UserSettings) => {
        const id = String(userId);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.users[id];
          if (!existing) return prev;

          return {
            ...prev,
            users: {
              ...prev.users,
              [id]: {
                ...existing,
                settings: {
                  ...(existing.settings ?? {}),
                  ...(settings ?? {}),
                },
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      isPostLikedBySelectedProfile: (scenarioId, postId) => {
        if (!db) return false;
        const sel = db.selectedProfileByScenario[String(scenarioId)];
        if (!sel) return false;
        const pr = db.profiles[String(sel)];
        const arr = pr?.likedPostIds ?? [];
        return arr.includes(String(postId));
      },

      toggleLike: async (scenarioId, postId) => {
        const sid = String(scenarioId);
        const pid = String(postId);

        const next = await updateDb((prev) => {
          const selectedProfileId = prev.selectedProfileByScenario[sid];
          if (!selectedProfileId) return prev;

          const liker = prev.profiles[String(selectedProfileId)];
          const post = prev.posts[pid];
          if (!liker || !post) return prev;

          const liked = (liker.likedPostIds ?? []).map(String);
          const already = liked.includes(pid);

          const nextLiked = already ? liked.filter((x) => x !== pid) : [...liked, pid];

          return {
            ...prev,
            profiles: {
              ...prev.profiles,
              [String(liker.id)]: {
                ...liker,
                likedPostIds: nextLiked,
                updatedAt: new Date().toISOString(),
              },
            },
            posts: {
              ...prev.posts,
              [pid]: {
                ...post,
                likeCount: Math.max(0, (post.likeCount ?? 0) + (already ? -1 : 1)),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      // ===== REPOSTS (events) =====

      getRepostEventForProfile: (profileId: string, postId: string) => {
        if (!db) return null;
        const id = `${String(profileId)}|${String(postId)}`;
        return db.reposts?.[id] ?? null;
      },

      isPostRepostedByProfileId: (profileId: string, postId: string) => {
        if (!db) return false;
        const id = `${String(profileId)}|${String(postId)}`;
        return !!db.reposts?.[id];
      },

      isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => {
        if (!db) return false;
        const sel = db.selectedProfileByScenario[String(scenarioId)];
        if (!sel) return false;
        const id = `${String(sel)}|${String(postId)}`;
        return !!db.reposts?.[id];
      },

      toggleRepost: async (scenarioId: string, postId: string) => {
        const sid = String(scenarioId);
        const pid = String(postId);

        const next = await updateDb((prev) => {
          const selectedProfileId = prev.selectedProfileByScenario[sid];
          if (!selectedProfileId) return prev;

          const reposterId = String(selectedProfileId);
          const post = prev.posts[pid];
          if (!post) return prev;

          const key = `${reposterId}|${pid}`;
          const reposts = { ...(prev as any).reposts };

          const already = !!reposts?.[key];
          const now = new Date().toISOString();

          if (already) {
            // remove repost event
            delete reposts[key];
          } else {
            // add repost event
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
                repostCount: Math.max(0, (post.repostCount ?? 0) + (already ? -1 : 1)),
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      deletePost: async (postId) => {
        const id = String(postId);
        const next = await updateDb((prev) => {
          if (!prev.posts[id]) return prev;

          const posts = { ...prev.posts };
          delete posts[id];

          // also delete repost events pointing to this post
          const reposts = { ...(prev as any).reposts };
          for (const k of Object.keys(reposts ?? {})) {
            if (String(reposts[k]?.postId) === id) delete reposts[k];
          }

          return { ...prev, posts, reposts };
        });

        setState({ isReady: true, db: next as any });
      },
    };
  }, [db]);

  return <Ctx.Provider value={{ ...state, ...api }}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppData must be used within AppDataProvider");
  return v;
}