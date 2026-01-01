// mobile/context/auth.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { User, UserSettings } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage"; 

type AuthState = {
  isReady: boolean;
  isLoggedIn: boolean;
  userId: string | null;

  // current user (cached for UI convenience)
  currentUser: User | null;

  signInMock: () => Promise<void>;
  signOut: () => Promise<void>;

  refreshCurrentUser: () => Promise<void>;
  updateUserSettings: (settings: UserSettings) => Promise<void>;
  updateUserAvatar: (avatarUrl?: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const KEY = "feedverse.auth.userId";
const DEV_USER_ID = "u14";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // hydrate stored auth id once
  useEffect(() => {
    (async () => {
      const storedUserId = await AsyncStorage.getItem(KEY);
      setUserId(storedUserId);
      setAuthReady(true);
    })();
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!userId) {
      setCurrentUser(null);
      return;
    }

    const db = await readDb();
    setCurrentUser((db as any)?.users?.[String(userId)] ?? null);
  }, [userId]);

  // keep currentUser in sync when userId changes
  useEffect(() => {
    if (!authReady) return;

    if (!userId) {
      setCurrentUser(null);
      return;
    }

    // best-effort fetch from storage
    refreshCurrentUser();
  }, [authReady, userId, refreshCurrentUser]);

  const signInMock = useCallback(async () => {
    setUserId(DEV_USER_ID);
    await AsyncStorage.setItem(KEY, DEV_USER_ID);
    // currentUser will be refreshed by effect
  }, []);

  const signOut = useCallback(async () => {
    setUserId(null);
    setCurrentUser(null);
    await AsyncStorage.removeItem(KEY);
  }, []);

  const updateUserSettings = useCallback(
    async (settings: UserSettings) => {
      if (!userId) return;

      const id = String(userId);
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const existing = (prev as any).users?.[id];
        if (!existing) return prev;

        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [id]: {
              ...existing,
              settings: {
                ...(existing.settings ?? {}),
                ...(settings ?? {}),
              },
              updatedAt: now,
            },
          },
        };
      });

      setCurrentUser((nextDb as any)?.users?.[id] ?? null);
    },
    [userId]
  );

  const updateUserAvatar = useCallback(
    async (avatarUrl?: string | null) => {
      if (!userId) return;

      const id = String(userId);
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const existing = (prev as any).users?.[id];
        if (!existing) return prev;

        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [id]: {
              ...existing,
              avatarUrl: avatarUrl ?? existing.avatarUrl,
              updatedAt: now,
            },
          },
        };
      });

      setCurrentUser((nextDb as any)?.users?.[id] ?? null);
    },
    [userId]
  );

  const value = useMemo<AuthState>(
    () => ({
      // auth is ready when storage hydration is done
      isReady: authReady,
      isLoggedIn: !!userId,
      userId,

      currentUser,

      signInMock,
      signOut,

      refreshCurrentUser,
      updateUserSettings,
      updateUserAvatar,
    }),
    [
      authReady,
      userId,
      currentUser,
      signInMock,
      signOut,
      refreshCurrentUser,
      updateUserSettings,
      updateUserAvatar,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}