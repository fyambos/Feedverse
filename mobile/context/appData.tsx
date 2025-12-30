// mobile/context/appData.tsx
import React from "react";
import type { DbV5, Post, Profile, Scenario, Repost, ScenarioTag, CharacterSheet } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";
import {
  buildGlobalTagFromKey,
} from "@/lib/tags";

type AppDataState = {
  isReady: boolean;
  db: DbV5 | null;
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
  // scenarios
  getScenarioById: (id: string) => Scenario | null;
  listScenarios: () => Scenario[];
  upsertScenario: (s: Scenario) => Promise<void>;
  joinScenarioByInviteCode: ( inviteCode: string, userId: string ) => Promise<{ scenario: Scenario; alreadyIn: boolean } | null>;
  transferScenarioOwnership: (scenarioId: string,fromUserId: string,toUserId: string ) => Promise<Scenario | null>;
  leaveScenario: (scenarioId: string, userId: string) => Promise<{ deleted: boolean } | null>;
  deleteScenario: (scenarioId: string, ownerUserId: string) => Promise<boolean>;
  setScenarioMode: (scenarioId: string, mode: "story" | "campaign") => Promise<Scenario | null>;

  // profiles
  getProfileById: (id: string) => Profile | null;
  getProfileByHandle: (scenarioId: string, handle: string) => Profile | null;
  listProfilesForScenario: (scenarioId: string) => Profile[];

  // posts
  getPostById: (id: string) => Post | null;
  listPostsForScenario: (scenarioId: string) => Post[];
  listRepliesForPost: (postId: string) => Post[];

  // paging
  listPostsPage: (args: PostsPageArgs) => PostsPageResult;
  listProfileFeedPage: (args: ProfileFeedPageArgs) => ProfileFeedPageResult;

  // selection
  getSelectedProfileId: (scenarioId: string) => string | null;

  // actions
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  upsertProfile: (p: Profile) => Promise<void>;
  upsertPost: (p: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;

  // likes
  toggleLike: (scenarioId: string, postId: string) => Promise<void>;
  isPostLikedBySelectedProfile: (scenarioId: string, postId: string) => boolean;

  // reposts
  toggleRepost: (scenarioId: string, postId: string) => Promise<void>;
  isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => boolean;

  // helpers
  isPostRepostedByProfileId: (profileId: string, postId: string) => boolean;
  getRepostEventForProfile: (profileId: string, postId: string) => Repost | null;
  
  // sheets
  getCharacterSheetByProfileId: (profileId: string) => CharacterSheet | null;
  upsertCharacterSheet: (sheet: CharacterSheet) => Promise<void>;
  
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

      // profile feed page
      listProfileFeedPage: ({ scenarioId, profileId, tab, limit = 15, cursor }) => {
        if (!db) return { items: [], nextCursor: null };

        const sid = String(scenarioId);
        const pid = String(profileId);

        const posts = Object.values(db.posts).filter((p) => p.scenarioId === sid);
        const authoredPosts = posts.filter((p) => String(p.authorProfileId) === pid);

        const profile = db.profiles[pid];
        const likedSet = new Set<string>((profile?.likedPostIds ?? []).map(String));

        const repostEvents = Object.values(db.reposts ?? {}).filter(
          (r) => String(r.scenarioId) === sid && String(r.profileId) === pid
        );

        const items: ProfileFeedItem[] = [];

        if (tab === "posts") {
          for (const p of authoredPosts.filter((p) => !p.parentPostId)) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }

          for (const r of repostEvents) {
            const post = db.posts[String(r.postId)];
            if (!post) continue;
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
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        items.sort((a, b) => {
          const c = String(b.activityAt).localeCompare(String(a.activityAt));
          if (c !== 0) return c;
          const k = String(b.kind).localeCompare(String(a.kind));
          if (k !== 0) return k;
          return String(b.post.id).localeCompare(String(a.post.id));
        });

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
                joinedDate: (p as any).joinedDate ?? (existing as any)?.joinedDate ?? createdAt,
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

          const insertedAt = (existing as any)?.insertedAt ?? (p as any).insertedAt ?? now;
          const createdAt = (p as any).createdAt ?? existing?.createdAt ?? now;

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

      // --- likes
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

          const now = new Date().toISOString();

          return {
            ...prev,
            profiles: {
              ...prev.profiles,
              [String(liker.id)]: {
                ...liker,
                likedPostIds: nextLiked,
                updatedAt: now,
              },
            },
            posts: {
              ...prev.posts,
              [pid]: {
                ...post,
                likeCount: Math.max(0, (post.likeCount ?? 0) + (already ? -1 : 1)),
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      // ---reposts
      getRepostEventForProfile: (profileId: string, postId: string) => {
        if (!db) return null;
        const id = `${String(profileId)}|${String(postId)}`;
        return (db as any).reposts?.[id] ?? null;
      },

      isPostRepostedByProfileId: (profileId: string, postId: string) => {
        if (!db) return false;
        const id = `${String(profileId)}|${String(postId)}`;
        return !!(db as any).reposts?.[id];
      },

      isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => {
        if (!db) return false;
        const sel = db.selectedProfileByScenario[String(scenarioId)];
        if (!sel) return false;
        const id = `${String(sel)}|${String(postId)}`;
        return !!(db as any).reposts?.[id];
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

          const reposts = { ...(prev as any).reposts };
          for (const k of Object.keys(reposts ?? {})) {
            if (String(reposts[k]?.postId) === id) delete reposts[k];
          }

          return { ...prev, posts, reposts };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- scenarios
      getScenarioById: (id) => (db ? db.scenarios[String(id)] ?? null : null),
      listScenarios: () => (db ? Object.values(db.scenarios) : []),

      upsertScenario: async (s) => {
        const id = String(s.id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.scenarios[id];

          // --- GLOBAL TAG REGISTRY ---
          const prevTags = (prev as any).tags ?? {};
          const nextTags: Record<string, ScenarioTag> = { ...prevTags };

          const scenarioTags: ScenarioTag[] = [];

          for (const raw of s.tags ?? []) {
            const key = String((raw as any).key ?? raw.id ?? "").toLowerCase();
            if (!key) continue;

            // already registered globally?
            let tag = nextTags[key];

            if (!tag) {
              const built = buildGlobalTagFromKey(key);
              if (!built) continue;

              tag = {
                id: `t_${built.key}`,
                key: built.key,
                name: built.name,
                color: built.color,
              };

              nextTags[key] = tag;
            }

            scenarioTags.push(tag);
          }

          return {
            ...prev,
            tags: nextTags,
            scenarios: {
              ...prev.scenarios,
              [id]: {
                ...(existing ?? {}),
                ...s,
                id,
                tags: scenarioTags,
                createdAt: existing?.createdAt ?? s.createdAt ?? now,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      joinScenarioByInviteCode: async (inviteCode, userId) => {
        const code = String(inviteCode ?? "").trim().toUpperCase();
        const uid = String(userId ?? "").trim();
        if (!code || !uid) return null;

        let alreadyIn = false;
        let foundScenarioId: string | null = null;

        const nextDb = await updateDb((prev) => {
          const scenarios = Object.values(prev.scenarios ?? {});
          const found = scenarios.find((s) => String((s as any).inviteCode ?? "").toUpperCase() === code);
          if (!found) return prev;

          const sid = String((found as any).id);
          foundScenarioId = sid;

          const current = prev.scenarios[sid];
          if (!current) return prev;

          const players = Array.isArray((current as any).playerIds)
            ? (current as any).playerIds.map(String)
            : [];

          alreadyIn = players.includes(uid);

          // if already in, don't modify
          if (alreadyIn) return prev;

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                playerIds: Array.from(new Set([...players, uid])),
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });

        if (!foundScenarioId) return null;

        const scenario = (nextDb as any)?.scenarios?.[foundScenarioId] as Scenario | undefined;
        if (!scenario) return null;

        return { scenario, alreadyIn };
      },

      transferScenarioOwnership: async (scenarioId: string, fromUserId: string, toUserId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const from = String(fromUserId ?? "").trim();
        const to = String(toUserId ?? "").trim();

        if (!sid || !from || !to) return null;
        if (from === to) return null;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          // only current owner can transfer
          const owner = String((current as any).ownerUserId ?? "");
          if (owner !== from) return prev;

          // target must be a player in the scenario
          const players = Array.isArray((current as any).playerIds)
            ? (current as any).playerIds.map(String)
            : [];

          if (!players.includes(to)) return prev;

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                ownerUserId: to,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });

        const updated = (nextDb as any)?.scenarios?.[sid] as Scenario | undefined;
        return updated ?? null;
      },

      leaveScenario: async (scenarioId: string, userId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const uid = String(userId ?? "").trim();
        console.log("[leaveScenario] called", { scenarioId, userId });
        if (!sid || !uid) return null;

        let deleted = false;

        const nextDb = await updateDb((prev) => {
          
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const ownerId = String((current as any).ownerUserId ?? "");
          const players = Array.isArray((current as any).playerIds)
          
            ? (current as any).playerIds.map(String)
            : [];

          if (!players.includes(uid)) return prev;

            const remaining: string[] = players.filter((p: string) => p !== uid);
          const now = new Date().toISOString();


          console.log("[leaveScenario] players before", players);
          console.log("[leaveScenario] ownerId", ownerId);

          // ✅ owner leaving
          if (uid === ownerId) {
            // allowed ONLY if they are alone (no other users)
            if (remaining.length > 0) {
              return prev; // UI should block and show "transfer ownership"
            }

            // alone -> deleting scenario silently
            deleted = true;

            const scenarios = { ...prev.scenarios };
            delete scenarios[sid];

            // optional cleanup: selected profile + profiles + posts + reposts
            const selectedProfileByScenario = { ...(prev as any).selectedProfileByScenario };
            delete selectedProfileByScenario[sid];

            const profiles = { ...prev.profiles };
            for (const k of Object.keys(profiles)) {
              if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
            }

            const posts = { ...prev.posts };
            for (const k of Object.keys(posts)) {
              if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
            }

            const reposts = { ...(prev as any).reposts };
            for (const k of Object.keys(reposts ?? {})) {
              if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
            }

            return { ...prev, scenarios, profiles, posts, reposts, selectedProfileByScenario };
          }

          // ✅ normal user leaving
          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                playerIds: remaining,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return { deleted };
      },

      deleteScenario: async (scenarioId: string, ownerUserId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const uid = String(ownerUserId ?? "").trim();
        if (!sid || !uid) return false;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const ownerId = String((current as any).ownerUserId ?? "");
          if (ownerId !== uid) return prev; // only owner can delete

          const scenarios = { ...prev.scenarios };
          delete scenarios[sid];

          // optional cleanup: selected profile + profiles + posts + reposts
          const selectedProfileByScenario = { ...(prev as any).selectedProfileByScenario };
          delete selectedProfileByScenario[sid];

          const profiles = { ...prev.profiles };
          for (const k of Object.keys(profiles)) {
            if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
          }

          const posts = { ...prev.posts };
          for (const k of Object.keys(posts)) {
            if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
          }

          const reposts = { ...(prev as any).reposts };
          for (const k of Object.keys(reposts ?? {})) {
            if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
          }

          return { ...prev, scenarios, profiles, posts, reposts, selectedProfileByScenario };
        });

        setState({ isReady: true, db: nextDb as any });

        // confirm it actually got deleted
        return !(nextDb as any)?.scenarios?.[sid];
      },
      setScenarioMode: async (scenarioId, mode) => {
        const sid = String(scenarioId ?? "").trim();
        const nextMode: "story" | "campaign" = mode === "campaign" ? "campaign" : "story";
        if (!sid) return null;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                mode: nextMode,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return (nextDb as any)?.scenarios?.[sid] ?? null;
      },
      // --- character sheets
      getCharacterSheetByProfileId: (profileId: string) =>
        db ? (db as any).sheets?.[String(profileId)] ?? null : null,

      upsertCharacterSheet: async (sheet: CharacterSheet) => {
        const now = new Date().toISOString();

        // keying strategy: sheets are stored by profileId
        const key = String((sheet as any).profileId ?? (sheet as any).ownerProfileId ?? "");

        if (!key) throw new Error("CharacterSheet.profileId is required");

        const nextDb = await updateDb((prev) => {
          const prevSheets = ((prev as any).sheets ?? {}) as Record<string, CharacterSheet>;
          const existing = prevSheets[key];

          const createdAt = (existing as any)?.createdAt ?? (sheet as any)?.createdAt ?? now;

          return {
            ...prev,
            sheets: {
              ...prevSheets,
              [key]: {
                ...(existing ?? {}),
                ...sheet,
                profileId: key,
                createdAt,
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
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