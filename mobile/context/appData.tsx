import React from "react";
import type { DbV3, Post, Profile, Scenario, User } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";

type AppDataState = {
  isReady: boolean;
  db: DbV3 | null;
};

type PostCursor = string; // `${createdAt}|${id}`

type PostsPageArgs = {
  scenarioId: string;
  limit?: number;
  cursor?: PostCursor | null; // null/undefined => first page
  // optional filter (reusable for profile/search later)
  filter?: (p: Post) => boolean;
  // optional: include replies or not
  includeReplies?: boolean; // default false
};

type PostsPageResult = {
  items: Post[];
  nextCursor: PostCursor | null;
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

  // NEW: paged listing (feed/profile/search can all reuse)
  listPostsPage: (args: PostsPageArgs) => PostsPageResult;

  getSelectedProfileId: (scenarioId: string) => string | null;

  // actions
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  upsertProfile: (p: Profile) => Promise<void>;
  upsertPost: (p: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
};

const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function makePostCursor(p: Post): PostCursor {
  return `${String(p.createdAt)}|${String(p.id)}`;
}

function sortDescByCreatedAtThenId(a: Post, b: Post) {
  // createdAt desc, id desc for stability
  const c = String(b.createdAt).localeCompare(String(a.createdAt));
  if (c !== 0) return c;
  return String(b.id).localeCompare(String(a.id));
}

function sortAscByCreatedAtThenId(a: Post, b: Post) {
  // used for replies
  const c = String(a.createdAt).localeCompare(String(b.createdAt));
  if (c !== 0) return c;
  return String(a.id).localeCompare(String(b.id));
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

      // --- NEW: paged posts (reusable everywhere)
      listPostsPage: ({ scenarioId, limit = 15, cursor, filter, includeReplies = false }) => {
        if (!db) return { items: [], nextCursor: null };

        // 1) build candidate list
        let items = Object.values(db.posts).filter((p) => p.scenarioId === String(scenarioId));

        if (!includeReplies) {
          items = items.filter((p) => !p.parentPostId);
        }

        if (filter) {
          items = items.filter(filter);
        }

        // 2) sort (feed style)
        items.sort(sortDescByCreatedAtThenId);

        // 3) apply cursor (start AFTER cursor item)
        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((p) => makePostCursor(p) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makePostCursor(page[page.length - 1]) : null;

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
        setState({ isReady: true, db: next });
      },

      upsertProfile: async (p) => {
        const next = await updateDb((prev) => ({
          ...prev,
          profiles: { ...prev.profiles, [String(p.id)]: p },
        }));
        setState({ isReady: true, db: next });
      },

      upsertPost: async (p) => {
        const next = await updateDb((prev) => ({
          ...prev,
          posts: { ...prev.posts, [String(p.id)]: p },
        }));
        setState({ isReady: true, db: next });
      },

      deletePost: async (postId) => {
        const id = String(postId);
        const next = await updateDb((prev) => {
          if (!prev.posts[id]) return prev;

          const posts = { ...prev.posts };

          // delete replies
          for (const p of Object.values(posts)) {
            if (p.parentPostId === id) delete posts[p.id];
          }

          delete posts[id];

          return { ...prev, posts };
        });

        setState({ isReady: true, db: next });
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
