import type { Dispatch, SetStateAction } from "react";
import type { Post, ProfilePin } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

type AuthLike = {
  token?: string | null;
};

type Deps = {
  getDb: () => any;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
  currentUserId: string;
  isUuidLike: (id: string) => boolean;
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(String)));
}

// --- pins helpers (stored on scenario.settings.pinnedPostIds)
function getPinnedIdsFromScenario(db: any, scenarioId: string): string[] {
  const sid = String(scenarioId);
  const s = db.scenarios?.[sid];
  const arr = ((s as any)?.settings?.pinnedPostIds ?? []) as any;
  return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
}

function getPinnedPostIdForProfileFromDb(db: any, profileId: string): string | null {
  const pid = String(profileId ?? "").trim();
  if (!pid) return null;

  const pins = ((db as any).profilePins ?? null) as Record<string, any> | null;
  if (!pins || typeof pins !== "object") return null;

  const raw = pins[pid];
  if (!raw) return null;

  // tolerate legacy/string-only values
  if (typeof raw === "string") {
    const v = raw.trim();
    return v ? v : null;
  }

  const postId = String((raw as any)?.postId ?? (raw as any)?.post_id ?? "").trim();
  return postId ? postId : null;
}

export function createPinsApi(deps: Deps) {
  const listPinnedPostsForScenario = (scenarioId: string): Post[] => {
    const db = deps.getDb();
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
  };

  const togglePinPost = async (scenarioId: string, postId: string, nextPinned: boolean): Promise<void> => {
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

    deps.setState({ isReady: true, db: nextDb as any });
  };

  const reorderPinnedPostsForScenario = async (scenarioId: string, orderedPostIds: string[]): Promise<void> => {
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

    deps.setState({ isReady: true, db: nextDb as any });
  };

  const getPinnedPostIdForProfile = (profileId: string): string | null => {
    const db = deps.getDb();
    if (!db) return null;
    return getPinnedPostIdForProfileFromDb(db, profileId);
  };

  const setPinnedPostForProfile = async (args: {
    scenarioId: string;
    profileId: string;
    postId: string | null;
  }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const sid = String(args?.scenarioId ?? "").trim();
    const pid = String(args?.profileId ?? "").trim();
    const nextPostId = args?.postId == null ? null : String(args.postId).trim();
    if (!sid) return { ok: false, error: "scenarioId is required" };
    if (!pid) return { ok: false, error: "profileId is required" };

    const currentUserId = String(deps.currentUserId ?? "").trim();
    if (!currentUserId) return { ok: false, error: "Not signed in" };

    const db = deps.getDb();

    const prof = db?.profiles?.[pid] ?? null;
    if (!prof) return { ok: false, error: "Profile not found" };
    if (String((prof as any).scenarioId ?? "") !== sid) return { ok: false, error: "Profile not in scenario" };

    const ownerUserId = String((prof as any).ownerUserId ?? "").trim();
    const isPublic = Boolean((prof as any).isPublic);
    const canPinAsProfile = ownerUserId === currentUserId || isPublic;
    if (!canPinAsProfile) return { ok: false, error: "Not allowed" };

    if (nextPostId) {
      const post = db?.posts?.[nextPostId] ?? null;
      if (!post) return { ok: false, error: "Post not found" };
      if (String((post as any).scenarioId ?? "") !== sid) return { ok: false, error: "Post not in scenario" };
    }

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    const backendEnabled = Boolean(token && baseUrl && deps.isUuidLike(sid) && deps.isUuidLike(pid));

    if (backendEnabled) {
      const res = await apiFetch({
        path: `/profiles/${encodeURIComponent(pid)}/pinned-post`,
        token,
        init: {
          method: "PUT",
          body: JSON.stringify({ postId: nextPostId }),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Failed (HTTP ${res.status})`;
        return { ok: false, error: msg };
      }

      const pin = (res.json as any)?.pin ?? null;
      const pinned = Boolean((res.json as any)?.pinned);
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const profilePins = { ...((prev as any).profilePins ?? {}) } as Record<string, ProfilePin>;

        if (!pinned || !nextPostId) {
          delete profilePins[pid];
        } else {
          profilePins[pid] = {
            profileId: pid,
            scenarioId: String(pin?.scenarioId ?? pin?.scenario_id ?? sid),
            postId: String(pin?.postId ?? pin?.post_id ?? nextPostId),
            createdAt: pin?.createdAt
              ? new Date(pin.createdAt).toISOString()
              : pin?.created_at
                ? new Date(pin.created_at).toISOString()
                : now,
            updatedAt: pin?.updatedAt
              ? new Date(pin.updatedAt).toISOString()
              : pin?.updated_at
                ? new Date(pin.updated_at).toISOString()
                : now,
          } as any;
        }

        return { ...prev, profilePins };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return { ok: true };
    }

    // Local-only fallback
    const now = new Date().toISOString();
    const nextDb = await updateDb((prev) => {
      const profilePins = { ...((prev as any).profilePins ?? {}) } as Record<string, ProfilePin>;

      if (!nextPostId) {
        delete profilePins[pid];
      } else {
        profilePins[pid] = {
          profileId: pid,
          scenarioId: sid,
          postId: nextPostId,
          createdAt: (profilePins[pid] as any)?.createdAt ?? now,
          updatedAt: now,
        } as any;
      }

      return { ...prev, profilePins };
    });

    deps.setState({ isReady: true, db: nextDb as any });
    return { ok: true };
  };

  return {
    listPinnedPostsForScenario,
    togglePinPost,
    reorderPinnedPostsForScenario,
    getPinnedPostIdForProfile,
    setPinnedPostForProfile,
  };
}
