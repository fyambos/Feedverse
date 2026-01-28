import type { CharacterSheet, ProfilePin } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { defaultScenarioNotificationPrefsMobile } from "../scenario/scenarioNotificationPrefs";

type AuthLike = {
  isReady: boolean;
  token?: string | null;
  userId?: string | null;
};

type ProviderStateLike = {
  isReady: boolean;
  db: any;
};

type ProfilesSyncRef = {
  current: {
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
  };
};

type SetStateLike = (next: { isReady: boolean; db: any }) => void;

type BackendEnv = {
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
};

export async function syncProfilesForScenarioBackend(args: {
  scenarioId: string;
  env: BackendEnv;
  auth: AuthLike;
  providerState: ProviderStateLike;
  profilesSyncRef: ProfilesSyncRef;
  setState: SetStateLike;
}): Promise<void> {
  const sid = String(args.scenarioId ?? "").trim();

  if (!args.env.backendEnabled) return;
  if (!sid || !args.env.isUuidLike(sid)) return;
  if (!args.auth.isReady) return;
  if (!args.providerState.isReady || !args.providerState.db) return;

  const token = String(args.auth.token ?? "").trim();
  const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!token || !baseUrl) return;

  const nowMs = Date.now();
  const lastAt = args.profilesSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
  const inFlight = Boolean(args.profilesSyncRef.current.inFlightByScenario[sid]);

  if (inFlight) return;
  if (nowMs - lastAt < 5_000) return;

  args.profilesSyncRef.current.inFlightByScenario[sid] = true;
  args.profilesSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

  try {
    const [profilesRes, sheetsRes, pinsRes, notifPrefsRes] = await Promise.all([
      apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/profiles`, token }),
      apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/character-sheets`, token }),
      apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/profile-pins`, token }),
      apiFetch({ path: `/scenarios/${encodeURIComponent(sid)}/notification-prefs`, token }),
    ]);

    if (!profilesRes.ok || !Array.isArray(profilesRes.json)) return;
    const rows = profilesRes.json as any[];
    const sheetRows = sheetsRes.ok && Array.isArray(sheetsRes.json) ? (sheetsRes.json as any[]) : [];
    const pinRows = pinsRes.ok && Array.isArray(pinsRes.json) ? (pinsRes.json as any[]) : [];
    const now = new Date().toISOString();

    const nextDb = await updateDb((prev) => {
      const profiles = { ...(prev.profiles ?? {}) } as any;
      const users = { ...((prev as any).users ?? {}) } as any;
      const sheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
      const profilePins = { ...((prev as any).profilePins ?? {}) } as Record<string, ProfilePin>;
      const scenarioNotificationPrefsByScenarioId = {
        ...(((prev as any).scenarioNotificationPrefsByScenarioId ?? {}) as any),
      };

      const seen = new Set<string>();

      for (const raw of rows) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;
        seen.add(id);

        const existing = profiles[id] ?? {};

        profiles[id] = {
          ...existing,
          id,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
          ownerUserId: String(raw?.ownerUserId ?? raw?.owner_user_id ?? ""),
          displayName: String(raw?.displayName ?? raw?.display_name ?? existing?.displayName ?? ""),
          handle: String(raw?.handle ?? existing?.handle ?? ""),
          avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? existing?.avatarUrl ?? ""),
          headerUrl: raw?.headerUrl ?? raw?.header_url ?? existing?.headerUrl,
          bio: raw?.bio ?? existing?.bio,
          isPublic: raw?.isPublic ?? raw?.is_public ?? existing?.isPublic,
          isPrivate: raw?.isPrivate ?? raw?.is_private ?? existing?.isPrivate,
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

        // If the backend included owner/user info inline, upsert into users map
        try {
          const ownerId = String(raw?.owner?.id ?? raw?.owner_id ?? raw?.ownerUserId ?? raw?.owner_user_id ?? "").trim();
          if (ownerId) {
            const existingUser = users[ownerId] ?? {};
            const ownerUsername = (
              raw?.owner?.username ??
              raw?.owner_username ??
              raw?.owner?.displayName ??
              raw?.owner_display_name ??
              raw?.owner?.name ??
              raw?.owner_name ??
              existingUser?.username ??
              ""
            ) as string;
            const ownerAvatar = (
              raw?.owner?.avatarUrl ?? raw?.owner?.avatar_url ?? raw?.owner_avatar_url ?? existingUser?.avatarUrl ?? ""
            ) as string;

            const firstNonEmpty = (...vals: any[]) => {
              for (const v of vals) {
                if (v == null) continue;
                const s = String(v).trim();
                if (s) return s;
              }
              return null;
            };

            const username =
              firstNonEmpty(
                ownerUsername,
                raw?.owner?.handle,
                raw?.owner?.email ? String(raw.owner.email).split("@")[0] : null,
                ownerId,
              ) ?? ownerId;

            users[ownerId] = {
              ...(existingUser ?? {}),
              id: ownerId,
              username: String(username),
              avatarUrl: String(ownerAvatar ?? ""),
              createdAt: existingUser?.createdAt ?? new Date().toISOString(),
            } as any;
          }
        } catch {
          // ignore owner upsert failures
        }
      }

      // replace pins for this scenario (best-effort)
      try {
        for (const [k, v] of Object.entries(profilePins)) {
          if (String((v as any)?.scenarioId ?? (v as any)?.scenario_id ?? "") === sid) {
            delete profilePins[k];
          }
        }
      } catch {}

      for (const raw of pinRows) {
        const profileId = String(raw?.profileId ?? raw?.profile_id ?? "").trim();
        const postId = String(raw?.postId ?? raw?.post_id ?? "").trim();
        if (!profileId || !postId) continue;

        profilePins[profileId] = {
          profileId,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
          postId,
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : now,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : now,
        } as any;
      }

      // Remove profiles for this scenario that are no longer on server.
      for (const [id, p] of Object.entries(profiles)) {
        if (String((p as any)?.scenarioId ?? "") !== sid) continue;
        if (seen.has(String(id))) continue;
        delete (profiles as any)[id];
      }

      // Replace sheets for this scenario (server is source of truth in backend mode).
      for (const k of Object.keys(sheets)) {
        const existing = (sheets as any)[k];
        if (String((existing as any)?.scenarioId ?? "") === sid) delete (sheets as any)[k];
      }

      for (const raw of sheetRows) {
        const profileId = String(raw?.profileId ?? raw?.profile_id ?? "").trim();
        if (!profileId) continue;

        const scenarioId2 = String(raw?.scenarioId ?? raw?.scenario_id ?? sid).trim();
        if (scenarioId2 !== sid) continue;

        const statsRaw = raw?.stats ?? {};
        const hpRaw = raw?.hp ?? {};

        const existing = (sheets as any)[profileId] ?? {};

        (sheets as any)[profileId] = {
          ...existing,
          profileId,
          scenarioId: scenarioId2,
          name: raw?.name ?? existing?.name,
          race: raw?.race ?? existing?.race,
          class: raw?.class ?? existing?.class,
          level: raw?.level ?? existing?.level,
          alignment: raw?.alignment ?? existing?.alignment,
          background: raw?.background ?? existing?.background,
          stats: {
            strength: Number(statsRaw?.strength ?? (existing as any)?.stats?.strength ?? 10),
            dexterity: Number(statsRaw?.dexterity ?? (existing as any)?.stats?.dexterity ?? 10),
            constitution: Number(statsRaw?.constitution ?? (existing as any)?.stats?.constitution ?? 10),
            intelligence: Number(statsRaw?.intelligence ?? (existing as any)?.stats?.intelligence ?? 10),
            wisdom: Number(statsRaw?.wisdom ?? (existing as any)?.stats?.wisdom ?? 10),
            charisma: Number(statsRaw?.charisma ?? (existing as any)?.stats?.charisma ?? 10),
          },
          hp: {
            current: Number(hpRaw?.current ?? (existing as any)?.hp?.current ?? 10),
            max: Number(hpRaw?.max ?? (existing as any)?.hp?.max ?? 10),
            temp: hpRaw?.temp != null ? Number(hpRaw.temp) : (existing as any)?.hp?.temp,
          },
          status: raw?.status ?? existing?.status,
          inventory: Array.isArray(raw?.inventory) ? raw.inventory : (existing as any)?.inventory ?? [],
          equipment: Array.isArray(raw?.equipment) ? raw.equipment : (existing as any)?.equipment,
          spells: Array.isArray(raw?.spells) ? raw.spells : (existing as any)?.spells,
          abilities: Array.isArray(raw?.abilities) ? raw.abilities : (existing as any)?.abilities,
          publicNotes: raw?.publicNotes ?? raw?.public_notes ?? (existing as any)?.publicNotes,
          privateNotes: raw?.privateNotes ?? raw?.private_notes ?? (existing as any)?.privateNotes,
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : (existing as any)?.createdAt ?? now,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : now,
        } as any;
      }

      // Cache server-side notification prefs for this scenario (best-effort).
      try {
        const uid = String(args.auth.userId ?? "").trim();
        const prefs = notifPrefsRes?.ok ? (notifPrefsRes as any)?.json?.prefs ?? null : null;
        if (uid) {
          scenarioNotificationPrefsByScenarioId[sid] = prefs
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
        }
      } catch {
        // ignore
      }

      return { ...(prev as any), profiles, sheets, users, profilePins, scenarioNotificationPrefsByScenarioId } as any;
    });

    args.setState({ isReady: true, db: nextDb as any });
  } finally {
    args.profilesSyncRef.current.inFlightByScenario[sid] = false;
  }
}
