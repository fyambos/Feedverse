import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { useAuth } from '@/context/auth';

type ProfileSelectionMap = Record<string, string>; 

type ProfileContextState = {
  isReady: boolean;
  userId: string | null;
  selectedProfileId: (scenarioId: string) => string | null;
  setSelectedProfileId: (scenarioId: string, profileId: string) => Promise<void>;
  getUserProfilesForScenario: (scenarioId: string) => any[];
  createProfile: (data: {
    scenarioId: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
  }) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextState | null>(null);

const KEY = 'feedverse.profile.selectedByScenario';
const CREATED_KEY = 'feedverse.profile.created';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth(); 
  const [isReady, setIsReady] = useState(false);
  const [map, setMap] = useState<ProfileSelectionMap>({});
  const [created, setCreated] = useState<any[]>([]);

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
      setIsReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
        const raw = await AsyncStorage.getItem(CREATED_KEY);
        if (raw) {
        try {
            setCreated(JSON.parse(raw));
        } catch {
            setCreated([]);
        }
        }
        setIsReady(true);
    })();
    }, []);

  const persist = async (next: ProfileSelectionMap) => {
    setMap(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

    const getUserProfilesForScenario = (scenarioId: string) => {
    const mock = MOCK_PROFILES.filter(
        p => p.ownerUserId === userId && p.scenarioId === scenarioId
    );

    const local = created.filter(
        p => p.ownerUserId === userId && p.scenarioId === scenarioId
    );

    return [...mock, ...local];
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

  const createProfile = async ({
  scenarioId,
  displayName,
  handle,
  bio,
}: {
  scenarioId: string;
  displayName: string;
  handle: string;
  bio?: string;
}) => {
  if (!userId) return;

  const profile = {
    id: `pr_${scenarioId}_${Date.now()}`,
    scenarioId,
    ownerUserId: userId,
    displayName,
    handle,
    avatarUrl: `https://i.pravatar.cc/150?u=${Date.now()}`,
    bio,
  };

  const next = [...created, profile];
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
      setSelectedProfileId,
      getUserProfilesForScenario,
      createProfile,
    }),
    [isReady, userId, map, created]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}