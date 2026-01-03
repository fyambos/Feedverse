// mobile/context/appData.tsx
import React from "react";
import type { DbV5, Post, Profile, Scenario, Repost, ScenarioTag, CharacterSheet } from "@/data/db/schema";
import { readDb, updateDb, writeDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";
import { buildGlobalTagFromKey } from "@/lib/tags";
import { pickScenarioExportJson } from "@/lib/importExport/importFromFile";
import { importScenarioFromJson } from "@/lib/importExport/importScenario";
import { useAuth } from "@/context/auth";
import { buildScenarioExportBundleV1 } from "@/lib/importExport/exportScenarioBundle";
import { saveAndShareScenarioExport } from "@/lib/importExport/exportScenario";

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


// GM: apply updates to sheets, then create a GM post that summarizes changes
export type GmApplySheetUpdateArgs = {
  scenarioId: string;
  gmProfileId: string; // author of the GM summary post
  targetProfileIds: string[]; // selected targets
  // patch applied to each sheet (shallow merge). You can pass absolute values here.
  patch: Partial<CharacterSheet>;
  // optional: meta labels shown in the GM post (e.g. "HP −1", "Set Status: poisoned")
  label?: string;
};

export type GmApplySheetUpdateResult = {
  postId: string;
  updatedProfileIds: string[];
  summaryText: string;
};

type AppDataApi = {
  // scenarios
  getScenarioById: (id: string) => Scenario | null;
  listScenarios: () => Scenario[];
  upsertScenario: (s: Scenario) => Promise<void>;
  joinScenarioByInviteCode: (
    inviteCode: string,
    userId: string
  ) => Promise<{ scenario: Scenario; alreadyIn: boolean } | null>;
  transferScenarioOwnership: (
    scenarioId: string,
    fromUserId: string,
    toUserId: string
  ) => Promise<Scenario | null>;
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

  // pins (campaign)
  togglePinPost: (scenarioId: string, postId: string, nextPinned: boolean) => Promise<void>;
  listPinnedPostsForScenario: (scenarioId: string) => Post[];
  reorderPinnedPostsForScenario: (scenarioId: string, orderedPostIds: string[]) => Promise<void>;

  // sheets
  getCharacterSheetByProfileId: (profileId: string) => CharacterSheet | null;
  upsertCharacterSheet: (sheet: CharacterSheet) => Promise<void>;

  // GM helper
  gmApplySheetUpdate: (args: GmApplySheetUpdateArgs) => Promise<GmApplySheetUpdateResult>;

  // import/export
  importScenarioFromFile: (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }) => Promise<
    | { ok: true; scenarioId: string; importedProfiles: number; importedPosts: number; renamedHandles: Array<{ from: string; to: string }> }
    | { ok: false; error: string }
  >;
  exportScenarioToFile: (args: {
    scenarioId: string;
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
    profileIds?: string[]; // if undefined => export all scenario profiles
  }) => Promise<
    | { ok: true; uri: string; filename: string; counts: { profiles: number; posts: number; reposts: number; sheets: number } }
    | { ok: false; error: string }
  >;
  previewImportScenarioFromFile: (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }) => Promise<
    | {
        ok: true;
        fileName?: string;
        jsonBytes: number;
        preview: {
          willCreateNewScenarioId: boolean;
          importedProfiles: number;
          importedPosts: number;
          importedReposts: number;
          importedSheets: number;
          renamedHandles: Array<{ from: string; to: string }>;
          skipped: {
            profilesDueToLimit: number;
            postsDueToMissingProfile: number;
            repostsDueToMissingProfileOrPost: number;
            sheetsDueToMissingProfile: number;
          };
        };
      }
    | { ok: false; error: string }
  >;

  // scenario settings
  getScenarioSettings: (scenarioId: string) => any;
  updateScenarioSettings: (scenarioId: string, patch: any) => Promise<void>;
};

const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function makePostCursor(p: Post): PostCursor {
  return `${String((p as any).insertedAt ?? "")}|${String(p.id)}`;
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

// --- pins helpers (stored on scenario.settings.pinnedPostIds)
function getPinnedIdsFromScenario(db: DbV5, scenarioId: string): string[] {
  const sid = String(scenarioId);
  const s = db.scenarios?.[sid];
  const arr = ((s as any)?.settings?.pinnedPostIds ?? []) as any;
  return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(String)));
}

// small util: diff shallow keys for GM post text
function diffShallow(prev: any, next: any): string[] {
  const lines: string[] = [];
  const keys = new Set<string>([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);

  const skip = new Set(["updatedAt", "createdAt", "profileId", "ownerProfileId", "id", "scenarioId"]);

  for (const k of Array.from(keys)) {
    if (skip.has(k)) continue;

    const a = (prev ?? {})[k];
    const b = (next ?? {})[k];

    const same =
      a === b ||
      (Number.isNaN(a) && Number.isNaN(b)) ||
      (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

    if (same) continue;

    // make short-ish readable output
    const aStr = typeof a === "string" ? a : a == null ? "—" : JSON.stringify(a);
    const bStr = typeof b === "string" ? b : b == null ? "—" : JSON.stringify(b);

    lines.push(`• ${k}: ${aStr} → ${bStr}`);
  }

  return lines;
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

  const auth = useAuth();
  const currentUserId = String(auth.userId ?? "");

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

        const repostEvents = Object.values((db as any).reposts ?? {}).filter(
          (r: any) => String(r.scenarioId) === sid && String(r.profileId) === pid
        );

        const items: ProfileFeedItem[] = [];

        if (tab === "posts") {
          // Track post ids already represented as normal posts on this profile page.
          // This prevents returning the same post twice (post + repost) which breaks
          // your UI because ProfileScreen maps feed items -> it.post (FlatList key = post.id).
          const authoredPostIds = new Set<string>();

          for (const p of authoredPosts.filter((p) => !p.parentPostId)) {
            const postId = String(p.id);
            authoredPostIds.add(postId);

            items.push({
              kind: "post",
              post: p,
              activityAt: String(p.createdAt),
            });
          }

          for (const r of repostEvents) {
            const post = db.posts[String((r as any).postId)];
            if (!post) continue;
            if (post.parentPostId) continue;

            // allow reposting your own post in the DB,
            // but DO NOT return it as a separate feed item (avoids duplicate post.id rows)
            if (String(post.authorProfileId) === pid) continue;

            // extra safety: if somehow the post is already represented, don't duplicate it
            if (authoredPostIds.has(String(post.id))) continue;

            items.push({
              kind: "repost",
              post,
              activityAt: String((r as any).createdAt),
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
        return (db as any).selectedProfileByScenario?.[String(scenarioId)] ?? null;
      },

      // --- actions
      setSelectedProfileId: async (scenarioId, profileId) => {
        const next = await updateDb((prev) => ({
          ...prev,
          selectedProfileByScenario: {
            ...(prev as any).selectedProfileByScenario,
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
          const createdAt = (existing as any)?.createdAt ?? (p as any).createdAt ?? now;

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
        const id = String((p as any).id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.posts[id];

          const insertedAt = (existing as any)?.insertedAt ?? (p as any).insertedAt ?? now;
          const createdAt = (p as any).createdAt ?? (existing as any)?.createdAt ?? now;

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

      deletePost: async (postId) => {
        const id = String(postId);
        const next = await updateDb((prev) => {
          if (!prev.posts[id]) return prev;

          const posts = { ...prev.posts };
          delete posts[id];

          const reposts = { ...((prev as any).reposts ?? {}) };
          for (const k of Object.keys(reposts ?? {})) {
            if (String((reposts as any)[k]?.postId) === id) delete reposts[k];
          }

          // also remove from pinned list for its scenario (if present)
          const scenarios = { ...prev.scenarios };
          const removedPostScenarioId = String((prev.posts as any)?.[id]?.scenarioId ?? "");

          if (removedPostScenarioId && scenarios[removedPostScenarioId]) {
            const s = scenarios[removedPostScenarioId];
            const prevSettings = (((s as any).settings ?? {}) as Record<string, any>);
            const prevPinned = Array.isArray(prevSettings.pinnedPostIds)
              ? prevSettings.pinnedPostIds.map(String).filter(Boolean)
              : [];

            if (prevPinned.includes(id)) {
              const nextPinned = prevPinned.filter((x) => x !== id);
              scenarios[removedPostScenarioId] = {
                ...s,
                settings: { ...prevSettings, pinnedPostIds: nextPinned },
                updatedAt: new Date().toISOString(),
              } as any;
            }
          }

          return { ...prev, posts, reposts, scenarios };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- likes
      isPostLikedBySelectedProfile: (scenarioId, postId) => {
        if (!db) return false;
        const sel = (db as any).selectedProfileByScenario?.[String(scenarioId)];
        if (!sel) return false;
        const pr = db.profiles[String(sel)];
        const arr = (pr as any)?.likedPostIds ?? [];
        return arr.includes(String(postId));
      },

      toggleLike: async (scenarioId, postId) => {
        const sid = String(scenarioId);
        const pid = String(postId);

        const next = await updateDb((prev) => {
          const selectedProfileId = (prev as any).selectedProfileByScenario?.[sid];
          if (!selectedProfileId) return prev;

          const liker = prev.profiles[String(selectedProfileId)];
          const post = prev.posts[pid];
          if (!liker || !post) return prev;

          const liked = ((liker as any).likedPostIds ?? []).map(String);
          const already = liked.includes(pid);

          const nextLiked: string[] = already ? liked.filter((x: string) => x !== pid) : [...liked, pid];

          const now = new Date().toISOString();

          return {
            ...prev,
            profiles: {
              ...prev.profiles,
              [String((liker as any).id)]: {
                ...liker,
                likedPostIds: nextLiked,
                updatedAt: now,
              } as any,
            },
            posts: {
              ...prev.posts,
              [pid]: {
                ...post,
                likeCount: Math.max(0, ((post as any).likeCount ?? 0) + (already ? -1 : 1)),
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- reposts
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
        const sel = (db as any).selectedProfileByScenario?.[String(scenarioId)];
        if (!sel) return false;
        const id = `${String(sel)}|${String(postId)}`;
        return !!(db as any).reposts?.[id];
      },

      toggleRepost: async (scenarioId: string, postId: string) => {
        const sid = String(scenarioId);
        const pid = String(postId);

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

        setState({ isReady: true, db: next as any });
      },

      // --- pins (campaign)
      listPinnedPostsForScenario: (scenarioId: string) => {
        if (!db) return [];
        const sid = String(scenarioId);

        const pinnedIds = getPinnedIdsFromScenario(db, sid);
        const out: Post[] = [];

        for (const id of pinnedIds) {
          const p = db.posts?.[String(id)];
          if (!p) continue;
          if (String((p as any).scenarioId) !== sid) continue;
          if ((p as any).parentPostId) continue;
          out.push(p);
        }

        return out;
      },

      togglePinPost: async (scenarioId: string, postId: string, nextPinned: boolean) => {
        const sid = String(scenarioId ?? "").trim();
        const pid = String(postId ?? "").trim();
        if (!sid || !pid) return;

        const nextDb = await updateDb((prev) => {
          const scenario = prev.scenarios?.[sid];
          if (!scenario) return prev;

          const post = prev.posts?.[pid];
          if (!post) return prev;

          // only pin root posts in this scenario
          if ((post as any).parentPostId) return prev;
          if (String((post as any).scenarioId) !== sid) return prev;

          const now = new Date().toISOString();

          const prevSettings = (((scenario as any).settings ?? {}) as Record<string, any>);
          const prevPinned = Array.isArray(prevSettings.pinnedPostIds)
            ? prevSettings.pinnedPostIds.map(String).filter(Boolean)
            : [];

          let pinnedIds = [...prevPinned];
          const already = pinnedIds.includes(pid);

          if (nextPinned) {
            if (!already) {
              // append so “first pinned is #1”
              pinnedIds.push(pid);
            }
          } else {
            if (already) pinnedIds = pinnedIds.filter((x) => x !== pid);
          }

          pinnedIds = uniq(pinnedIds);

          const nextSettings = { ...prevSettings, pinnedPostIds: pinnedIds };

          const posts = { ...prev.posts };

          // update pinned posts’ pinOrder (1-based)
          pinnedIds.forEach((id, idx) => {
            const p = posts[id];
            if (!p) return;
            if (String((p as any).scenarioId) !== sid) return;
            posts[id] = {
              ...p,
              isPinned: true,
              pinOrder: idx + 1,
              updatedAt: now,
            } as any;
          });

          // clear pin flags for posts in this scenario not pinned anymore
          const pinnedSet = new Set(pinnedIds);
          for (const p of Object.values(posts)) {
            if (String((p as any).scenarioId) !== sid) continue;
            const id = String((p as any).id);
            if (!pinnedSet.has(id) && (((p as any).isPinned) || (p as any).pinOrder != null)) {
              posts[id] = {
                ...p,
                isPinned: false,
                pinOrder: undefined,
                updatedAt: now,
              } as any;
            }
          }

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...scenario,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
            posts,
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      reorderPinnedPostsForScenario: async (scenarioId: string, orderedPostIds: string[]) => {
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return;

        const ids = (orderedPostIds ?? []).map(String).filter(Boolean);

        const nextDb = await updateDb((prev) => {
          const scenario = prev.scenarios?.[sid];
          if (!scenario) return prev;

          const now = new Date().toISOString();

          // validate + keep only existing root posts in this scenario
          const clean: string[] = [];
          const seen = new Set<string>();

          for (const id of ids) {
            if (seen.has(id)) continue;
            const p = prev.posts?.[id];
            if (!p) continue;
            if (String((p as any).scenarioId) !== sid) continue;
            if ((p as any).parentPostId) continue;
            clean.push(id);
            seen.add(id);
          }

          const prevSettings = (((scenario as any).settings ?? {}) as Record<string, any>);
          const nextSettings = { ...prevSettings, pinnedPostIds: clean };

          const posts = { ...prev.posts };

          // apply pinOrder (1-based)
          clean.forEach((id, idx) => {
            const p = posts[id];
            if (!p) return;
            posts[id] = {
              ...p,
              isPinned: true,
              pinOrder: idx + 1,
              updatedAt: now,
            } as any;
          });

          // clear pin flags for posts in scenario not in clean
          const pinnedSet = new Set(clean);
          for (const p of Object.values(posts)) {
            if (String((p as any).scenarioId) !== sid) continue;
            const id = String((p as any).id);
            if (!pinnedSet.has(id) && (((p as any).isPinned) || (p as any).pinOrder != null)) {
              posts[id] = { ...p, isPinned: false, pinOrder: undefined, updatedAt: now } as any;
            }
          }

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...scenario,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
            posts,
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      // --- scenarios
      getScenarioById: (id) => (db ? db.scenarios[String(id)] ?? null : null),
      listScenarios: () => (db ? Object.values(db.scenarios) : []),

      upsertScenario: async (s) => {
        const id = String((s as any).id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.scenarios[id];

          // --- GLOBAL TAG REGISTRY ---
          const prevTags = ((prev as any).tags ?? {}) as Record<string, ScenarioTag>;
          const nextTags: Record<string, ScenarioTag> = { ...prevTags };

          const scenarioTags: ScenarioTag[] = [];

          for (const raw of (s as any).tags ?? []) {
            const key = String((raw as any).key ?? (raw as any).id ?? "").toLowerCase();
            if (!key) continue;

            let tag = nextTags[key];

            if (!tag) {
              const built = buildGlobalTagFromKey(key);
              if (!built) continue;

              tag = {
                id: `t_${built.key}`,
                key: built.key,
                name: built.name,
                color: built.color,
              } as any;

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
                createdAt: (existing as any)?.createdAt ?? (s as any).createdAt ?? now,
                updatedAt: now,
              } as any,
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

          const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
          alreadyIn = players.includes(uid);

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
              } as any,
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

          const owner = String((current as any).ownerUserId ?? "");
          if (owner !== from) return prev;

          const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
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
              } as any,
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
        if (!sid || !uid) return null;

        let deleted = false;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const ownerId = String((current as any).ownerUserId ?? "");
          const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
          if (!players.includes(uid)) return prev;

          const remaining: string[] = players.filter((p: string) => p !== uid);
          const now = new Date().toISOString();

          // owner leaving (allowed only if alone)
          if (uid === ownerId) {
            if (remaining.length > 0) return prev;

            deleted = true;

            const scenarios = { ...prev.scenarios };
            delete scenarios[sid];

            const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
            delete selectedProfileByScenario[sid];

            const profiles = { ...prev.profiles };
            for (const k of Object.keys(profiles)) {
              if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
            }

            const posts = { ...prev.posts };
            for (const k of Object.keys(posts)) {
              if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
            }

            const reposts = { ...((prev as any).reposts ?? {}) };
            for (const k of Object.keys(reposts ?? {})) {
              if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
            }

            const sheets = { ...((prev as any).sheets ?? {}) };
            for (const k of Object.keys(sheets)) {
              const sheet = (sheets as any)[k];
              if (String(sheet?.scenarioId ?? "") === sid) delete sheets[k];
            }

            return { ...prev, scenarios, profiles, posts, reposts, sheets, selectedProfileByScenario };
          }

          // normal user leaving
          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                playerIds: remaining,
                updatedAt: now,
              } as any,
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
          if (ownerId !== uid) return prev;

          const scenarios = { ...prev.scenarios };
          delete scenarios[sid];

          const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
          delete selectedProfileByScenario[sid];

          const profiles = { ...prev.profiles };
          for (const k of Object.keys(profiles)) {
            if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
          }

          const posts = { ...prev.posts };
          for (const k of Object.keys(posts)) {
            if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
          }

          const reposts = { ...((prev as any).reposts ?? {}) };
          for (const k of Object.keys(reposts ?? {})) {
            if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
          }

          const sheets = { ...((prev as any).sheets ?? {}) };
          for (const k of Object.keys(sheets)) {
            const sheet = (sheets as any)[k];
            if (String(sheet?.scenarioId ?? "") === sid) delete sheets[k];
          }

          return { ...prev, scenarios, profiles, posts, reposts, sheets, selectedProfileByScenario };
        });

        setState({ isReady: true, db: nextDb as any });
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
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return (nextDb as any)?.scenarios?.[sid] ?? null;
      },

      // --- character sheets
      getCharacterSheetByProfileId: (profileId: string) => (db ? (db as any).sheets?.[String(profileId)] ?? null : null),

      upsertCharacterSheet: async (sheet: CharacterSheet) => {
        const now = new Date().toISOString();
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

      // GM: apply patch to 1+ sheets, then create a GM post that logs the diff
      gmApplySheetUpdate: async ({ scenarioId, gmProfileId, targetProfileIds, patch, label }) => {
        const sid = String(scenarioId ?? "").trim();
        const gmId = String(gmProfileId ?? "").trim();
        const targets = (targetProfileIds ?? []).map(String).filter(Boolean);

        if (!sid) throw new Error("gmApplySheetUpdate: scenarioId is required");
        if (!gmId) throw new Error("gmApplySheetUpdate: gmProfileId is required");
        if (targets.length === 0) throw new Error("gmApplySheetUpdate: targetProfileIds is required");

        const now = new Date().toISOString();
        const postId = `gm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        let summaryText = "";
        let updatedProfileIds: string[] = [];

        const nextDb = await updateDb((prev) => {
          const prevSheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
          const profiles = { ...prev.profiles };

          const perTargetBlocks: string[] = [];

          for (const pid of targets) {
            const profile = profiles[String(pid)];
            if (!profile) continue;

            const existing = (prevSheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);

            const nextSheet = {
              ...(existing ?? {}),
              ...(patch ?? {}),
              profileId: pid,
              scenarioId: sid,
              updatedAt: now,
              createdAt: (existing as any)?.createdAt ?? now,
            } as any;

            // write back
            prevSheets[pid] = nextSheet;
            updatedProfileIds.push(pid);

            // build diff lines
            const lines = diffShallow(existing, nextSheet);
            if (lines.length === 0) {
              perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}: (no changes)`);
            } else {
              perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}\n${lines.join("\n")}`);
            }
          }

          const targetHandles = updatedProfileIds
            .map((pid) => {
              const p = profiles[String(pid)];
              return p ? `@${String((p as any).handle ?? pid)}` : `@${pid}`;
            })
            .join(", ");

          summaryText =
            `⚙️ gm update${label ? ` — ${label}` : ""}\n` +
            `targets: ${targetHandles}\n\n` +
            perTargetBlocks.join("\n\n");

          const newPost: Post = {
            id: postId,
            scenarioId: sid,
            authorProfileId: gmId,
            text: summaryText,
            createdAt: now,
            insertedAt: now,
          } as any;

          return {
            ...prev,
            sheets: prevSheets as any,
            posts: {
              ...prev.posts,
              [postId]: newPost as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });

        // NOTE: summaryText / updatedProfileIds were set inside updateDb closure
        return { postId, updatedProfileIds, summaryText };
      },

      // --- import/export
      importScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        if (!db) return { ok: false, error: "DB not ready" };
        if (!auth.isReady) return { ok: false, error: "Auth not ready" };
        if (!currentUserId) return { ok: false, error: "Not signed in" };

        const picked = await pickScenarioExportJson();
        if (!picked.ok) return picked;

        const res = importScenarioFromJson(picked.raw, {
          db,
          currentUserId,
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
          forceNewScenarioId: true,
        });

        if (!res.ok) return res;

        // persist
        await writeDb(res.nextDb); // OR updateDb(() => res.nextDb)
        setState({ isReady: true, db: res.nextDb });

        return {
          ok: true,
          scenarioId: res.imported.scenarioId,
          importedProfiles: res.imported.profiles,
          importedPosts: res.imported.posts,
          renamedHandles: res.imported.renamedHandles,
        };
      },

      exportScenarioToFile: async ({ scenarioId, includeProfiles, includePosts, includeReposts, includeSheets, profileIds }) => {
        try {
          if (!db) return { ok: false, error: "DB not ready" };

          const scope = {
            includeProfiles,
            includePosts,
            includeReposts,
            includeSheets,
            exportAllProfiles: !profileIds || profileIds.length === 0,
            selectedProfileIds: profileIds ?? [],
          };

          const bundle = buildScenarioExportBundleV1(db, scenarioId, scope);

          const { uri, filename } = await saveAndShareScenarioExport(bundle);

          const counts = {
            profiles: bundle.profiles?.length ?? 0,
            posts: bundle.posts?.length ?? 0,
            reposts: bundle.reposts?.length ?? 0,
            sheets: bundle.sheets?.length ?? 0,
          };

          return { ok: true, uri, filename, counts };
        } catch (e: any) {
          return { ok: false, error: String(e?.message ?? e) };
        }
      },

      previewImportScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        if (!db) return { ok: false, error: "DB not ready" };
        if (!currentUserId) return { ok: false, error: "Not signed in" };

        const picked = await pickScenarioExportJson();
        if (!picked.ok) return picked;

        const res = importScenarioFromJson(picked.raw, {
          db,
          currentUserId,
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
          forceNewScenarioId: true,
        });

        if (!res.ok) return res;

        return {
          ok: true,
          fileName: picked.fileName,
          jsonBytes: picked.jsonBytes,
          preview: {
            willCreateNewScenarioId: true,
            importedProfiles: res.imported.profiles,
            importedPosts: res.imported.posts,
            importedReposts: res.imported.reposts,
            importedSheets: res.imported.sheets,
            renamedHandles: res.imported.renamedHandles,
            skipped: res.imported.skipped,
          },
        };
      },

      // --- scenario settings
      getScenarioSettings: (scenarioId: string) => {
        if (!db) return {};
        const sid = String(scenarioId ?? "").trim();
        return (db.scenarios?.[sid] as any)?.settings ?? {};
      },

      updateScenarioSettings: async (scenarioId: string, patch: any) => {
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const prevSettings = ((current as any).settings ?? {}) as Record<string, any>;
          const nextSettings = { ...prevSettings, ...(patch ?? {}) };

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },
    };
  }, [db, currentUserId, auth.isReady]);

  return <Ctx.Provider value={{ ...state, ...api }}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppData must be used within AppDataProvider");
  return v;
}