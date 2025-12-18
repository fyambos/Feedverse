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
};

const ProfileContext = createContext<ProfileContextState | null>(null);

const KEY = 'feedverse.profile.selectedByScenario';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth(); 
  const [isReady, setIsReady] = useState(false);
  const [map, setMap] = useState<ProfileSelectionMap>({});

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

  const persist = async (next: ProfileSelectionMap) => {
    setMap(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

    const getUserProfilesForScenario = (scenarioId: string) => {
    if (!userId) return [];

    return MOCK_PROFILES.filter(
        (p: any) => p.ownerUserId === userId && p.scenarioId === scenarioId
    );
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

  const value = useMemo(
    () => ({
      isReady,
      userId,
      selectedProfileId,
      setSelectedProfileId,
      getUserProfilesForScenario,
    }),
    [isReady, userId, map]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}