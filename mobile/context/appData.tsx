import React from "react";
import type { DbV3, Post, Profile, Scenario, User } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";

type AppDataState = {
  isReady: boolean;
  db: DbV3 | null;
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

  getSelectedProfileId: (scenarioId: string) => string | null;

  // actions
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  upsertProfile: (p: Profile) => Promise<void>;
  upsertPost: (p: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
};

const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  // storage is "felix" (no @). but accept "@felix" from UI.
  return String(input).trim().replace(/^@+/, "").toLowerCase();
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

// Debugging: print scenarios after seeding
/*
React.useEffect(() => {
  (async () => {
    const existing = await readDb();
    const db = await seedDbIfNeeded(existing);

    // 🔍 DEBUG
    if (__DEV__) {
      const { debugPrintScenariosFromFeeds } =
        await import("@/app/debug/printScenariosFromFeeds");
      debugPrintScenariosFromFeeds();
    }

    setState({ isReady: true, db });
  })();
}, []);
*/
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
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : [],

      listRepliesForPost: (postId) =>
        db
          ? Object.values(db.posts)
              .filter((p) => p.parentPostId === String(postId))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          : [],

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

          // irreversible delete: remove the post + its replies (optional but usually desired)
          const posts = { ...prev.posts };

          // delete replies to this post
          for (const p of Object.values(posts)) {
            if (p.parentPostId === id) delete posts[p.id];
          }

          // delete the post itself
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
