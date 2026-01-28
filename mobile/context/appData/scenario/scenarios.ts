import type { Dispatch, SetStateAction } from "react";
import type { Conversation, DbV5, GlobalTag, Message, Profile, Scenario, ScenarioTag } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { buildGlobalTagFromKey } from "@/lib/content/tags";
import { findScenarioIdByInviteCodeSync } from "@/data/db/sqliteCore";

type AuthLike = {
  token?: string | null;
  isReady?: boolean;
};

type Deps = {
  getDb: () => DbV5 | null;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
  currentUserId: string;
  isUuidLike: (id: string) => boolean;
  markProfilesSyncStale: (scenarioId: string) => void;
};

export function createScenariosApi(deps: Deps) {
  const upsertScenario = async (s: Scenario): Promise<Scenario> => {
    const upsertScenarioLocal = async (localScenario: Scenario) => {
      const id = String((localScenario as any).id);
      const now = new Date().toISOString();

      const next = await updateDb((prev) => {
        const existing = prev.scenarios[id];

        // --- GLOBAL TAG REGISTRY ---
        const prevTags = ((prev as any).tags ?? {}) as Record<string, GlobalTag>;
        const nextTags: Record<string, GlobalTag> = { ...prevTags };

        const scenarioTags: ScenarioTag[] = [];

        for (const raw of (localScenario as any).tags ?? []) {
          const key = String((raw as any).key ?? (raw as any).id ?? "").toLowerCase();
          if (!key) continue;

          let tag = nextTags[key];

          if (!tag) {
            const built = buildGlobalTagFromKey(key);
            if (!built) continue;

            nextTags[key] = built;
            tag = built;
          }

          scenarioTags.push({
            id: `t_${tag.key}`,
            key: tag.key,
            name: tag.name,
            color: tag.color,
          } as any);
        }

        return {
          ...prev,
          tags: nextTags,
          scenarios: {
            ...prev.scenarios,
            [id]: {
              ...(existing ?? {}),
              ...localScenario,
              id,
              tags: scenarioTags,
              createdAt: (existing as any)?.createdAt ?? (localScenario as any).createdAt ?? now,
              updatedAt: now,
            } as any,
          },
        };
      });

      deps.setState({ isReady: true, db: next as any });
    };

    const normalizeScenarioFromServer = (raw: any, fallback?: any): Scenario => {
      const now = new Date().toISOString();

      const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
      const hasPlayerIds = Array.isArray(playerIdsRaw);
      const playerIds = hasPlayerIds ? playerIdsRaw.map(String).filter(Boolean) : undefined;

      const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
      const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

      const scenario: Scenario = {
        ...(fallback ?? {}),
        id: String(raw?.id ?? (fallback as any)?.id ?? "").trim(),
        name: String(raw?.name ?? (fallback as any)?.name ?? ""),
        cover: String(raw?.cover ?? raw?.cover_url ?? (fallback as any)?.cover ?? ""),
        inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? (fallback as any)?.inviteCode ?? ""),
        ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? (fallback as any)?.ownerUserId ?? ""),
        allowPlayersReorderMessages:
          raw?.allow_players_reorder_messages != null
            ? Boolean(raw.allow_players_reorder_messages)
            : raw?.allowPlayersReorderMessages != null
              ? Boolean(raw.allowPlayersReorderMessages)
              : ((fallback as any)?.allowPlayersReorderMessages ?? true),
        description: raw?.description != null ? String(raw.description) : (fallback as any)?.description,
        mode:
          raw?.mode === "campaign" || raw?.mode === "story"
            ? raw.mode
            : (fallback as any)?.mode === "campaign"
              ? "campaign"
              : "story",
        // IMPORTANT: empty arrays are meaningful (e.g. no members in join table).
        playerIds: hasPlayerIds ? (playerIds ?? []) : ((fallback as any)?.playerIds ?? []),
        tags: Array.isArray(raw?.tags) ? raw.tags : ((fallback as any)?.tags ?? []),
        gmUserIds: gmUserIds ?? (fallback as any)?.gmUserIds,
        settings: raw?.settings != null ? raw.settings : (fallback as any)?.settings,
        createdAt: raw?.created_at
          ? new Date(raw.created_at).toISOString()
          : raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : (fallback as any)?.createdAt ?? now,
        updatedAt: raw?.updated_at
          ? new Date(raw.updated_at).toISOString()
          : raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : now,
      } as any;

      return scenario;
    };

    // Backend mode: create/update on server, then merge response into local DB.
    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const sid = String((s as any)?.id ?? "").trim();
      const isEdit = Boolean(sid && deps.isUuidLike(sid));

      const payload = {
        name: String((s as any)?.name ?? "").trim(),
        cover: String((s as any)?.cover ?? "").trim(),
        inviteCode: String((s as any)?.inviteCode ?? "").trim(),
        description: (s as any)?.description ?? null,
        mode: (s as any)?.mode === "campaign" ? "campaign" : "story",
        settings: (s as any)?.settings ?? {},
        allowPlayersReorderMessages: Boolean((s as any)?.allowPlayersReorderMessages ?? true),
        gmUserIds: Array.isArray((s as any)?.gmUserIds) ? (s as any)?.gmUserIds : undefined,
        tags: Array.isArray((s as any)?.tags) ? (s as any)?.tags : undefined,
      };

      const res = await apiFetch({
        path: isEdit ? `/scenarios/${encodeURIComponent(sid)}` : "/scenarios",
        token,
        init: {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Save failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const raw = (res.json as any)?.scenario;
      if (!raw) throw new Error("Invalid server response");

      const db = deps.getDb();
      const normalized = normalizeScenarioFromServer(raw, isEdit ? (db as any)?.scenarios?.[sid] : undefined);
      if (!String((normalized as any)?.id ?? "").trim()) throw new Error("Invalid server response");

      await upsertScenarioLocal(normalized);
      return normalized;
    }

    await upsertScenarioLocal(s);
    return s;
  };

  const joinScenarioByInviteCode = async (
    inviteCode: string,
    userId: string,
  ): Promise<{ scenario: Scenario; alreadyIn: boolean } | null> => {
    const code = String(inviteCode ?? "").trim().toUpperCase();
    const uid = String(userId ?? "").trim();
    if (!code || !uid) return null;

    // Backend mode: ask server to join by invite code, then merge returned scenario into local DB.
    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: "/scenarios/join",
        token,
        init: {
          method: "POST",
          body: JSON.stringify({ inviteCode: code }),
        },
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Join failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const payload = res.json as any;
      const raw = payload?.scenario;
      const alreadyIn = Boolean(payload?.alreadyIn);
      const sid = String(raw?.id ?? "").trim();
      if (!raw || !sid) throw new Error("Invalid server response");

      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const existing = (prev.scenarios as any)?.[sid];

        const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
        const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String) : [];

        const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
        const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

        const settings = raw?.settings != null ? raw.settings : undefined;

        const nextScenario: Scenario = {
          ...(existing ?? {}),
          id: sid,
          name: String(raw?.name ?? existing?.name ?? ""),
          cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
          inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
          ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
          description: raw?.description != null ? String(raw.description) : existing?.description,
          mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : (existing?.mode ?? "story"),
          playerIds:
            playerIds.length > 0
              ? Array.from(new Set([...playerIds, uid]))
              : Array.from(new Set([...(existing?.playerIds ?? []).map(String), uid])),
          tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
          gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
          settings: settings ?? (existing as any)?.settings,
          createdAt: raw?.created_at
            ? new Date(raw.created_at).toISOString()
            : raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : (existing?.createdAt ?? now),
          updatedAt: raw?.updated_at
            ? new Date(raw.updated_at).toISOString()
            : raw?.updatedAt
              ? new Date(raw.updatedAt).toISOString()
              : now,
        } as any;

        // If we were previously "out" locally (profiles were made public), re-joining should reclaim them.
        const profiles = { ...prev.profiles };
        if (!alreadyIn) {
          for (const k of Object.keys(profiles)) {
            const p = (profiles as any)[k];
            if (!p) continue;
            if (String(p.scenarioId) !== sid) continue;
            if (String(p.ownerUserId) !== uid) continue;
            if (!p.isPublic) continue;
            profiles[k] = { ...p, isPublic: false, updatedAt: now };
          }
        }

        const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
        const selectedProfileId = selectedProfileByScenario[sid];
        if (selectedProfileId) {
          const profile = (profiles as any)?.[selectedProfileId] ?? (prev as any).profiles?.[selectedProfileId];
          if (!profile || String(profile.ownerUserId) !== uid || !!profile.isPublic) {
            delete selectedProfileByScenario[sid];
          }
        }

        return {
          ...prev,
          scenarios: {
            ...(prev.scenarios ?? {}),
            [sid]: nextScenario as any,
          },
          profiles,
          selectedProfileByScenario,
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      const scenario = (nextDb as any)?.scenarios?.[sid] as Scenario | undefined;
      if (!scenario) return null;
      return { scenario, alreadyIn };
    }

    let alreadyIn = false;
    let foundScenarioId: string | null = null;

    let scenarioIdHint: string | null = null;
    try {
      scenarioIdHint = findScenarioIdByInviteCodeSync(code);
    } catch {
      scenarioIdHint = null;
    }

    const nextDb = await updateDb((prev) => {
      const sid = String(scenarioIdHint ?? "").trim();
      if (!sid) return prev;

      foundScenarioId = sid;

      const current = prev.scenarios[sid];
      if (!current) return prev;

      const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
      alreadyIn = players.includes(uid);

      if (alreadyIn) return prev;

      const now = new Date().toISOString();

      // also reclaim any of your still-owned shared profiles in this scenario
      // (i.e. profiles that were made public when you left, and were not adopted by someone else)
      const profiles = { ...prev.profiles };
      for (const k of Object.keys(profiles)) {
        const p = (profiles as any)[k];
        if (!p) continue;
        if (String(p.scenarioId) !== sid) continue;
        if (String(p.ownerUserId) !== uid) continue;
        if (!p.isPublic) continue;
        profiles[k] = { ...p, isPublic: false, updatedAt: now };
      }

      const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
      const selectedProfileId = selectedProfileByScenario[sid];
      if (selectedProfileId) {
        const profile = (profiles as any)?.[selectedProfileId] ?? (prev as any).profiles?.[selectedProfileId];
        if (!profile || String(profile.ownerUserId) !== uid || !!profile.isPublic) {
          delete selectedProfileByScenario[sid];
        }
      }

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
        profiles,
        selectedProfileByScenario,
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });

    if (!foundScenarioId) return null;

    const scenario = (nextDb as any)?.scenarios?.[foundScenarioId] as Scenario | undefined;
    if (!scenario) return null;

    return { scenario, alreadyIn };
  };

  const adoptPublicProfile = async ({
    scenarioId,
    profileId,
    userId,
  }: {
    scenarioId: string;
    profileId: string;
    userId: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const sid = String(scenarioId ?? "").trim();
    const pid = String(profileId ?? "").trim();
    const uid = String(userId ?? "").trim();

    if (!sid) return { ok: false, error: "scenarioId is required" };
    if (!pid) return { ok: false, error: "profileId is required" };
    if (!uid) return { ok: false, error: "userId is required" };

    const db = deps.getDb();
    if (!db) return { ok: false, error: "DB not ready" };

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/profiles/${encodeURIComponent(pid)}/adopt`,
        token,
        init: { method: "POST" },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Adoption failed (HTTP ${res.status})`;
        return { ok: false, error: msg };
      }

      const raw = (res.json as any)?.profile;
      if (!raw) return { ok: false, error: "Invalid server response" };

      const now = new Date().toISOString();
      const nextDb = await updateDb((prev) => {
        const profiles = { ...(prev as any).profiles } as any;
        const id = String(raw?.id ?? pid);
        const existing = profiles[id] ?? (prev as any).profiles?.[id] ?? {};

        profiles[id] = {
          ...existing,
          id,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
          ownerUserId: String(raw?.ownerUserId ?? raw?.owner_user_id ?? uid),
          displayName: String(raw?.displayName ?? raw?.display_name ?? existing?.displayName ?? ""),
          handle: String(raw?.handle ?? existing?.handle ?? ""),
          avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? existing?.avatarUrl ?? ""),
          headerUrl: raw?.headerUrl ?? raw?.header_url ?? existing?.headerUrl,
          bio: raw?.bio ?? existing?.bio,
          isPublic: raw?.isPublic ?? raw?.is_public ?? false,
          isPrivate: raw?.isPrivate ?? raw?.is_private ?? true,
          joinedDate: raw?.joinedDate ?? raw?.joined_date ?? existing?.joinedDate,
          location: raw?.location ?? existing?.location,
          link: raw?.link ?? existing?.link,
          followerCount: raw?.followerCount ?? raw?.follower_count ?? existing?.followerCount,
          followingCount: raw?.followingCount ?? raw?.following_count ?? existing?.followingCount,
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
        } as any;

        return { ...prev, profiles };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return { ok: true };
    }

    const scenario = (db as any).scenarios?.[sid];
    if (!scenario) return { ok: false, error: "Scenario not found" };

    const players: string[] = Array.isArray((scenario as any).playerIds) ? (scenario as any).playerIds.map(String) : [];
    if (!players.includes(uid)) return { ok: false, error: "User not in scenario" };

    const existing = (db as any).profiles?.[pid] as Profile | undefined;
    if (!existing) return { ok: false, error: "Profile not found" };
    if (String((existing as any).scenarioId) !== sid) return { ok: false, error: "Profile not in scenario" };

    const ownerId = String((existing as any).ownerUserId ?? "");
    if (ownerId === uid) return { ok: false, error: "You already own this profile" };
    if (!existing.isPublic) return { ok: false, error: "Profile not shared" };

    const now = new Date().toISOString();

    const nextDb = await updateDb((prev) => {
      const current = (prev as any).profiles?.[pid];
      if (!current) return prev;
      if (String((current as any).scenarioId) !== sid) return prev;
      if (!(current as any).isPublic) return prev;

      return {
        ...prev,
        profiles: {
          ...(prev as any).profiles,
          [pid]: {
            ...current,
            ownerUserId: uid,
            isPublic: false,
            updatedAt: now,
          },
        },
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });

    const after = (nextDb as any)?.profiles?.[pid];
    if (!after) return { ok: false, error: "Adoption failed" };
    if (String((after as any).ownerUserId ?? "") !== uid) return { ok: false, error: "Adoption failed" };

    return { ok: true };
  };

  const transferScenarioOwnership = async (
    scenarioId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<Scenario | null> => {
    const sid = String(scenarioId ?? "").trim();
    const from = String(fromUserId ?? "").trim();
    const to = String(toUserId ?? "").trim();

    if (!sid || !from || !to) return null;
    if (from === to) return null;

    const transferOwnershipLocal = async () => {
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

      deps.setState({ isReady: true, db: nextDb as any });

      const updated = (nextDb as any)?.scenarios?.[sid] as Scenario | undefined;
      return updated ?? null;
    };

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/transfer-ownership`,
        token,
        init: {
          method: "POST",
          body: JSON.stringify({ toUserId: to }),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Transfer failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const raw = (res.json as any)?.scenario;
      if (!raw) throw new Error("Invalid server response");

      // merge server scenario via upsertScenario (will go local because token/baseUrl present -> would recurse)
      // so do a direct local merge here.
      const now = new Date().toISOString();
      const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
      const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];
      const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
      const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

      const nextDb = await updateDb((prev) => {
        const existing = (prev.scenarios as any)?.[sid];
        const merged: Scenario = {
          ...(existing ?? {}),
          id: String(raw?.id ?? sid),
          name: String(raw?.name ?? existing?.name ?? ""),
          cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
          inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
          ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
          description: raw?.description != null ? String(raw.description) : existing?.description,
          mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : (existing?.mode ?? "story"),
          playerIds: playerIds.length ? playerIds : (existing?.playerIds ?? []),
          tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
          gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
          settings: raw?.settings != null ? raw.settings : (existing as any)?.settings,
          createdAt: raw?.created_at
            ? new Date(raw.created_at).toISOString()
            : raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : (existing?.createdAt ?? now),
          updatedAt: raw?.updated_at
            ? new Date(raw.updated_at).toISOString()
            : raw?.updatedAt
              ? new Date(raw.updatedAt).toISOString()
              : now,
        } as any;

        return {
          ...prev,
          scenarios: {
            ...(prev.scenarios ?? {}),
            [sid]: merged as any,
          },
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return ((nextDb as any)?.scenarios?.[sid] as Scenario | undefined) ?? null;
    }

    return await transferOwnershipLocal();
  };

  const transferProfilesToUser = async ({
    scenarioId,
    profileIds,
    toUserId,
  }: {
    scenarioId: string;
    profileIds: string[];
    toUserId: string;
  }): Promise<{ ok: true; transferred: number; skipped: string[] } | { ok: false; error: string }> => {
    const sid = String(scenarioId ?? "").trim();
    const to = String(toUserId ?? "").trim();
    const ids = (profileIds ?? []).map(String).filter(Boolean);

    if (!sid) return { ok: false, error: "scenarioId is required" };
    if (!to) return { ok: false, error: "toUserId is required" };
    if (ids.length === 0) return { ok: false, error: "profileIds is required" };

    const db = deps.getDb();
    if (!db) return { ok: false, error: "DB not ready" };
    if (!deps.auth.isReady) return { ok: false, error: "Auth not ready" };
    if (!deps.currentUserId) return { ok: false, error: "Not signed in" };

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/transfer-profiles`,
        token,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUserId: to, profileIds: ids }),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Transfer failed (HTTP ${res.status})`;
        return { ok: false, error: msg };
      }

      const transferred = Number((res.json as any)?.transferred ?? 0);
      const skipped = Array.isArray((res.json as any)?.skipped) ? (res.json as any).skipped.map(String) : [];

      // Refresh profiles from server after transfer.
      deps.markProfilesSyncStale(sid);
      return { ok: true, transferred, skipped };
    }

    const scenario = (db as any).scenarios?.[sid];
    if (!scenario) return { ok: false, error: "Scenario not found" };

    const players: string[] = Array.isArray((scenario as any).playerIds) ? (scenario as any).playerIds.map(String) : [];

    if (!players.includes(to)) return { ok: false, error: "Target user not in scenario" };

    const scenarioOwnerId = String((scenario as any).ownerUserId ?? "");
    const isScenarioOwner = scenarioOwnerId && scenarioOwnerId === deps.currentUserId;

    const attemptedUnique = Array.from(new Set(ids));
    const now = new Date().toISOString();
    const skipped: string[] = [];

    const nextDb = await updateDb((prev) => {
      const profiles = { ...prev.profiles };

      for (const pid of attemptedUnique) {
        const existing = profiles[pid];
        if (!existing) {
          skipped.push(pid);
          continue;
        }

        if (String((existing as any).scenarioId) !== sid) {
          skipped.push(pid);
          continue;
        }

        const ownerId = String((existing as any).ownerUserId ?? "");
        const canTransfer = ownerId === deps.currentUserId || isScenarioOwner;
        if (!canTransfer) {
          skipped.push(pid);
          continue;
        }

        if (ownerId === to) continue; // already owned by target

        profiles[pid] = {
          ...existing,
          ownerUserId: to,
          updatedAt: now,
        } as any;
      }

      return { ...prev, profiles };
    });

    deps.setState({ isReady: true, db: nextDb as any });

    // transferred = profiles that ended up owned by `to` and not skipped
    const skippedSet = new Set(skipped.map(String));
    let transferred = 0;
    for (const pid of attemptedUnique) {
      if (skippedSet.has(pid)) continue;
      const p = (nextDb as any).profiles?.[pid];
      if (!p) continue;
      if (String((p as any).scenarioId) !== sid) continue;
      if (String((p as any).ownerUserId) === to) transferred += 1;
    }

    return { ok: true, transferred, skipped };
  };

  const leaveScenario = async (scenarioId: string, userId: string): Promise<{ deleted: boolean } | null> => {
    const sid = String(scenarioId ?? "").trim();
    const uid = String(userId ?? "").trim();
    if (!sid || !uid) return null;

    let deleted = false;

    const deleteScenarioCascadeLocal = async () => {
      const nextDb = await updateDb((prev) => {
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

        const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
        for (const k of Object.keys(conversations)) {
          if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
        }

        const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
        for (const k of Object.keys(messages)) {
          if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
        }

        return {
          ...prev,
          scenarios,
          profiles,
          posts,
          reposts,
          sheets,
          conversations,
          messages,
          selectedProfileByScenario,
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
    };

    const leaveScenarioLocal = async () => {
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

          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          for (const k of Object.keys(conversations)) {
            if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
          }

          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
          for (const k of Object.keys(messages)) {
            if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
          }

          return {
            ...prev,
            scenarios,
            profiles,
            posts,
            reposts,
            sheets,
            conversations,
            messages,
            selectedProfileByScenario,
          };
        }

        // normal user leaving
        // - remove from scenario playerIds
        // - detach all profiles you own in this scenario so they are shared/public + unowned
        const profiles = { ...prev.profiles };
        for (const k of Object.keys(profiles)) {
          const p = (profiles as any)[k];
          if (!p) continue;
          if (String(p.scenarioId) !== sid) continue;
          if (String(p.ownerUserId) !== uid) continue;
          profiles[k] = { ...p, ownerUserId: "", isPublic: true, updatedAt: now };
        }

        const gmUserIds = Array.isArray((current as any).gmUserIds)
          ? (current as any).gmUserIds.map(String).filter((x: string) => x !== uid)
          : (current as any).gmUserIds;

        return {
          ...prev,
          scenarios: {
            ...prev.scenarios,
            [sid]: {
              ...current,
              playerIds: remaining,
              gmUserIds,
              updatedAt: now,
            } as any,
          },
          profiles,
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
    };

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/leave`,
        token,
        init: {
          method: "POST",
          body: JSON.stringify({}),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Leave failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      deleted = Boolean((res.json as any)?.deleted);

      if (deleted) {
        await deleteScenarioCascadeLocal();
      } else {
        // Mirror local behavior so the scenario immediately disappears from the list.
        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
          const remaining: string[] = players.filter((p: string) => p !== uid);
          const now = new Date().toISOString();

          const profiles = { ...prev.profiles };
          for (const k of Object.keys(profiles)) {
            const p = (profiles as any)[k];
            if (!p) continue;
            if (String(p.scenarioId) !== sid) continue;
            if (String(p.ownerUserId) !== uid) continue;
            profiles[k] = { ...p, ownerUserId: "", isPublic: true, updatedAt: now };
          }

          const gmUserIds = Array.isArray((current as any).gmUserIds)
            ? (current as any).gmUserIds.map(String).filter((x: string) => x !== uid)
            : (current as any).gmUserIds;

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                playerIds: remaining,
                gmUserIds,
                updatedAt: now,
              } as any,
            },
            profiles,
          };
        });

        deps.setState({ isReady: true, db: nextDb as any });
      }

      return { deleted };
    }

    await leaveScenarioLocal();
    return { deleted };
  };

  const deleteScenario = async (scenarioId: string, ownerUserId: string): Promise<boolean> => {
    const sid = String(scenarioId ?? "").trim();
    const uid = String(ownerUserId ?? "").trim();
    if (!sid || !uid) return false;

    const deleteScenarioLocal = async () => {
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

        const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
        for (const k of Object.keys(conversations)) {
          if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
        }

        const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
        for (const k of Object.keys(messages)) {
          if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
        }

        return {
          ...prev,
          scenarios,
          profiles,
          posts,
          reposts,
          sheets,
          conversations,
          messages,
          selectedProfileByScenario,
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return !(nextDb as any)?.scenarios?.[sid];
    };

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}`,
        token,
        init: { method: "DELETE" },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Delete failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // Server deleted; now cascade locally.
      return await deleteScenarioLocal();
    }

    return await deleteScenarioLocal();
  };

  const setScenarioMode = async (scenarioId: string, mode: "story" | "campaign"): Promise<Scenario | null> => {
    const sid = String(scenarioId ?? "").trim();
    const nextMode: "story" | "campaign" = mode === "campaign" ? "campaign" : "story";
    if (!sid) return null;

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}`,
        token,
        init: {
          method: "PATCH",
          body: JSON.stringify({ mode: nextMode }),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Update failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const raw = (res.json as any)?.scenario;
      if (!raw) throw new Error("Invalid server response");

      const now = new Date().toISOString();
      const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
      const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];
      const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
      const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

      const nextDb = await updateDb((prev) => {
        const existing = (prev.scenarios as any)?.[sid];

        const merged: Scenario = {
          ...(existing ?? {}),
          id: String(raw?.id ?? sid),
          name: String(raw?.name ?? existing?.name ?? ""),
          cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
          inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
          ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
          description: raw?.description != null ? String(raw.description) : existing?.description,
          mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : nextMode,
          playerIds: playerIds.length ? playerIds : (existing?.playerIds ?? []),
          tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
          gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
          settings: raw?.settings != null ? raw.settings : (existing as any)?.settings,
          createdAt: raw?.created_at
            ? new Date(raw.created_at).toISOString()
            : raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : (existing?.createdAt ?? now),
          updatedAt: raw?.updated_at
            ? new Date(raw.updated_at).toISOString()
            : raw?.updatedAt
              ? new Date(raw.updatedAt).toISOString()
              : now,
        } as any;

        return {
          ...prev,
          scenarios: {
            ...prev.scenarios,
            [sid]: merged as any,
          },
        };
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return (nextDb as any)?.scenarios?.[sid] ?? null;
    }

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

    deps.setState({ isReady: true, db: nextDb as any });
    return (nextDb as any)?.scenarios?.[sid] ?? null;
  };

  return {
    upsertScenario,
    joinScenarioByInviteCode,
    adoptPublicProfile,
    transferScenarioOwnership,
    transferProfilesToUser,
    leaveScenario,
    deleteScenario,
    setScenarioMode,
  };
}
