import type { Dispatch, SetStateAction } from "react";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

export type ScenarioNotificationPrefs = {
  scenarioId: string;
  userId: string;
  mentionsEnabled: boolean;
  repliesEnabled: boolean;
  messagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  likesEnabled: boolean;
  repostsEnabled: boolean;
  quotesEnabled: boolean;
  ignoredProfileIds: string[];
};

export function getScenarioNotificationPrefsFromDb(db: any, scenarioId: string): ScenarioNotificationPrefs | null {
  try {
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return null;
    const map = (db as any)?.scenarioNotificationPrefsByScenarioId ?? null;
    const prefs = map?.[sid] ?? null;
    return prefs ? (prefs as any) : null;
  } catch {
    return null;
  }
}

export function defaultScenarioNotificationPrefsMobile(scenarioId: string, userId: string): ScenarioNotificationPrefs {
  return {
    scenarioId: String(scenarioId),
    userId: String(userId),
    mentionsEnabled: true,
    repliesEnabled: true,
    messagesEnabled: true,
    groupMessagesEnabled: true,
    likesEnabled: true,
    repostsEnabled: true,
    quotesEnabled: true,
    ignoredProfileIds: [],
  };
}

type AuthLike = {
  token?: string | null;
  userId?: string | null;
};

type Deps = {
  getDb: () => any;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
  isBackendEnabled: () => boolean;
  isUuidLike: (id: string) => boolean;
};

export function createScenarioNotificationPrefsApi(deps: Deps) {
  const normalize = (scenarioId: string, userId: string, prefs: any | null): ScenarioNotificationPrefs => {
    const sid = String(scenarioId ?? "").trim();
    const uid = String(userId ?? "").trim();

    return prefs
      ? {
          ...defaultScenarioNotificationPrefsMobile(sid, uid),
          ...(prefs as any),
          scenarioId: sid,
          userId: uid,
          ignoredProfileIds: Array.isArray((prefs as any)?.ignoredProfileIds)
            ? (prefs as any).ignoredProfileIds.map(String).filter(Boolean)
            : Array.isArray((prefs as any)?.ignored_profile_ids)
              ? (prefs as any).ignored_profile_ids.map(String).filter(Boolean)
              : [],
        }
      : defaultScenarioNotificationPrefsMobile(sid, uid);
  };

  const cacheToDb = async (sid: string, normalized: ScenarioNotificationPrefs) => {
    try {
      const nextDb = await updateDb((prev) => {
        const scenarioNotificationPrefsByScenarioId = {
          ...(((prev as any).scenarioNotificationPrefsByScenarioId ?? {}) as any),
          [sid]: normalized,
        };
        return { ...(prev as any), scenarioNotificationPrefsByScenarioId } as any;
      });
      deps.setState({ isReady: true, db: nextDb as any });
    } catch {
      // ignore caching failures
    }
  };

  const getScenarioNotificationPrefs = async (scenarioId: string): Promise<ScenarioNotificationPrefs | null> => {
    const sid = String(scenarioId ?? "").trim();
    if (!deps.isBackendEnabled()) return null;
    if (!sid || !deps.isUuidLike(sid)) return null;

    const token = String(deps.auth.token ?? "").trim();
    const uid = String(deps.auth.userId ?? "").trim();
    if (!token || !uid) return null;

    const res = await apiFetch({
      path: `/scenarios/${encodeURIComponent(sid)}/notification-prefs`,
      token,
    });
    if (!res.ok) return null;

    const prefs = (res.json as any)?.prefs ?? null;
    const normalized = normalize(sid, uid, prefs);
    await cacheToDb(sid, normalized);

    return prefs as any;
  };

  const updateScenarioNotificationPrefs = async (scenarioId: string, patch: any): Promise<ScenarioNotificationPrefs | null> => {
    const sid = String(scenarioId ?? "").trim();
    if (!deps.isBackendEnabled()) throw new Error("Not in backend mode");
    if (!sid || !deps.isUuidLike(sid)) throw new Error("Invalid scenarioId");

    const token = String(deps.auth.token ?? "").trim();
    const uid = String(deps.auth.userId ?? "").trim();
    if (!token || !uid) throw new Error("Not signed in");

    const res = await apiFetch({
      path: `/scenarios/${encodeURIComponent(sid)}/notification-prefs`,
      token,
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(String((res.json as any)?.error ?? "Update failed"));
    }

    const prefs = (res.json as any)?.prefs ?? null;
    const normalized = normalize(sid, uid, prefs);
    await cacheToDb(sid, normalized);

    return prefs as any;
  };

  return {
    getScenarioNotificationPrefs,
    updateScenarioNotificationPrefs,
  };
}
