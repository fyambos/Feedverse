import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { useAuth } from '@/context/auth';

export type Profile = {
  id: string;
  scenarioId: string;
  ownerUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  bio?: string;
};

function normHandle(h: string) {
  return String(h ?? '').trim().toLowerCase();
}

type ProfileSelectionMap = Record<string, string>; 

type ProfileContextState = {
  isReady: boolean;
  userId: string | null;
  selectedProfileId: (scenarioId: string) => string | null;
  updateProfile: (data: {
    scenarioId: string;
    id?: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
  }) => Promise<void>;
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  getUserProfilesForScenario: (scenarioId: string) => any[];
  createProfile: (data: {
    scenarioId: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
  }) => Promise<void>;
  getProfileById: (scenarioId: string, profileId: string) => Profile | null;
  getProfileByHandle: (scenarioId: string, handle: string) => Profile | null;
};

const ProfileContext = createContext<ProfileContextState | null>(null);

const KEY = 'feedverse.profile.selectedByScenario';
const CREATED_KEY = 'feedverse.profile.created';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth(); 
  const [map, setMap] = useState<ProfileSelectionMap>({});
  const [created, setCreated] = useState<Profile[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [createdReady, setCreatedReady] = useState(false);
  const isReady = mapReady && createdReady;

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        try {
          setMap(JSON.parse(raw));
        } catch {
          setMap({});
        }
      }
      setMapReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
        const raw = await AsyncStorage.getItem(CREATED_KEY);
        if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setCreated(Array.isArray(parsed) ? parsed : []);
        } catch {
            setCreated([]);
        }
        }
        setCreatedReady(true);
    })();
    }, []);

  const persist = async (next: ProfileSelectionMap) => {
    setMap(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

  const getAllProfilesForScenario = (scenarioId: string) => {
    const mock = MOCK_PROFILES.filter((p) => p.scenarioId === scenarioId) as Profile[];

    // Local overrides/creates are stored in `created`. They may include edits for mock profiles.
    const local = created.filter((p) => p.scenarioId === scenarioId) as Profile[];

    // De-dupe by id, preferring local overrides over mock entries.
    const byId = new Map<string, Profile>();
    for (const p of mock) byId.set(String(p.id), p);
    for (const p of local) byId.set(String(p.id), p);

    // Order: local first (newest first as stored), then remaining mocks.
    const ordered: Profile[] = [];
    const seen = new Set<string>();

    for (const p of local) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      const v = byId.get(id);
      if (v) ordered.push(v);
      seen.add(id);
    }

    for (const p of mock) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      const v = byId.get(id);
      if (v) ordered.push(v);
      seen.add(id);
    }

    return ordered;
  };

  const getProfileById = (scenarioId: string, profileId: string) => {
    if (!scenarioId || !profileId) return null;
    const list = getAllProfilesForScenario(scenarioId);
    return list.find((p) => String(p.id) === String(profileId)) ?? null;
  };

  const getProfileByHandle = (scenarioId: string, handle: string) => {
    if (!scenarioId || !handle) return null;
    const needle = normHandle(handle);
    const list = getAllProfilesForScenario(scenarioId);
    return list.find((p) => normHandle(p.handle) === needle) ?? null;
  };

  const getUserProfilesForScenario = (scenarioId: string) => {
    if (!userId) return [];
    return getAllProfilesForScenario(scenarioId).filter((p) => p.ownerUserId === userId);
  };

  const selectedProfileId = (scenarioId: string) => {
    const list = getUserProfilesForScenario(scenarioId);
    if (list.length === 0) return null;

    // last selected if valid, else first profile
    const saved = map[scenarioId];
    const exists = saved && list.some((p: any) => p.id === saved);
    return exists ? saved : list[0].id;
  };

  const setSelectedProfileId = async (scenarioId: string, profileId: string) => {
    await persist({ ...map, [scenarioId]: profileId });
  };

  const updateProfile = async (data: {
    scenarioId: string;
    id?: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
  }) => {
    if (!userId) return;

    const scenarioId = data.scenarioId;

    // If caller didn’t provide an id, edit the currently selected profile for this scenario.
    const fallbackId = selectedProfileId(scenarioId) ?? undefined;
    const id = data.id ?? fallbackId;
    if (!id) return;

    // Find existing profile (created or mock) to preserve missing fields.
    const existing =
      created.find((p: any) => p.id === id) ??
      MOCK_PROFILES.find((p: any) => p.id === id);

    const nextProfile = {
      id,
      scenarioId,
      ownerUserId: userId,
      displayName: data.displayName,
      handle: data.handle,
      avatarUrl:
        data.avatarUrl ??
        (existing as any)?.avatarUrl ??
        `https://i.pravatar.cc/150?u=${Date.now()}`,
      bio: data.bio ?? (existing as any)?.bio,
    };

    // Upsert into local created storage.
    const nextCreated = (() => {
      const idx = created.findIndex((p: any) => p.id === id);
      if (idx >= 0) {
        const copy = [...created];
        copy[idx] = nextProfile;
        return copy;
      }
      return [nextProfile, ...created];
    })();

    setCreated(nextCreated);
    await AsyncStorage.setItem(CREATED_KEY, JSON.stringify(nextCreated));

    // Keep selection stable on the edited profile.
    await setSelectedProfileId(scenarioId, id);
  };

  const createProfile = async ({
    scenarioId,
    displayName,
    handle,
    avatarUrl,
    bio,
  }: {
    scenarioId: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
  }) => {
  if (!userId) return;

  const profile = {
    id: `pr_${scenarioId}_${Date.now()}`,
    scenarioId,
    ownerUserId: userId,
    displayName,
    handle,
    avatarUrl: avatarUrl ?? `https://i.pravatar.cc/150?u=${Date.now()}`,
    bio,
  };

  const next = [profile, ...created];
  setCreated(next);
  await AsyncStorage.setItem(CREATED_KEY, JSON.stringify(next));

  // auto-select new profile
  await setSelectedProfileId(scenarioId, profile.id);
};

  const value = useMemo(
    () => ({
      isReady,
      userId,
      selectedProfileId,
      updateProfile,
      setSelectedProfileId,
      getUserProfilesForScenario,
      createProfile,
      getProfileById,
      getProfileByHandle,
    }),
    [mapReady, createdReady, userId, map, created]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}