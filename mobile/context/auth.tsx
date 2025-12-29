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
import { updateDb } from "@/data/db/storage";
import { useAppData } from "@/context/appData";

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
  // AppData is the single source of truth for the DB lifecycle
  const app = useAppData();
  const { isReady: appReady, db } = app;

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

  // keep currentUser in sync when app db or userId changes
  useEffect(() => {
    if (!authReady || !appReady) return;

    if (!userId || !db) {
      setCurrentUser(null);
      return;
    }

    setCurrentUser((db as any)?.users?.[String(userId)] ?? null);
  }, [authReady, appReady, userId, db]);

  const refreshCurrentUser = useCallback(async () => {
    // since AppData owns db, "refresh" here is just re-reading from current db
    if (!appReady || !db || !userId) {
      setCurrentUser(null);
      return;
    }
    setCurrentUser((db as any)?.users?.[String(userId)] ?? null);
  }, [appReady, db, userId]);

  const signInMock = useCallback(async () => {
    setUserId(DEV_USER_ID);
    await AsyncStorage.setItem(KEY, DEV_USER_ID);

    // currentUser will sync from AppData db via effect
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
        const existing = prev.users?.[id];
        if (!existing) return prev;

        return {
          ...prev,
          users: {
            ...prev.users,
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
        const existing = prev.users?.[id];
        if (!existing) return prev;

        return {
          ...prev,
          users: {
            ...prev.users,
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
      isReady: authReady && appReady,
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
      appReady,
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