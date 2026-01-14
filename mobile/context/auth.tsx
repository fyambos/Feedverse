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
import * as bcrypt from "bcryptjs";

import type { User, UserSettings } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage"; 
import { seedDbIfNeeded } from "@/data/db/seed";
import { normalizeUsernameInput } from "@/lib/validation/auth";

type AuthState = {
  isReady: boolean;
  isLoggedIn: boolean;
  userId: string | null;

  // backend auth is not wired in feedverse-dev yet; keep token for UI compatibility
  token: string | null;

  // current user (cached for UI convenience)
  currentUser: User | null;

  signInMock: () => Promise<void>;
  signIn: (args: { identifier: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (args: {
    email: string;
    password: string;
    username?: string;
    name?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;

  refreshCurrentUser: () => Promise<void>;
  updateUserSettings: (settings: UserSettings) => Promise<void>;
  updateUserAvatar: (avatarUrl?: string | null) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const KEY = "feedverse.auth.userId";
const DEV_USER_ID = "u14";

const BCRYPT_ROUNDS = 10;

// React Native doesn't always provide WebCrypto/Node crypto.
// bcryptjs needs a source of random bytes to generate salts.
// For local/offline auth we can safely fall back to Math.random.
// (This is NOT cryptographically secure; switch to a secure RNG when wiring real backend auth.)
try {
  const anyBcrypt = bcrypt as any;
  if (typeof anyBcrypt?.setRandomFallback === "function") {
    anyBcrypt.setRandomFallback((len: number) => {
      const out = new Array<number>(len);
      for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
      return out;
    });
  }
} catch {
  // ignore
}

function looksLikeBcryptHash(hash: string) {
  return /^\$2[aby]\$\d\d\$/.test(hash);
}

function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash) return false;
  if (looksLikeBcryptHash(passwordHash)) return bcrypt.compareSync(password, passwordHash);
  return passwordHash === password;
}

function hashPassword(password: string) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIdentifier(input: string) {
  return String(input ?? "").trim().toLowerCase();
}

function isProbablyEmail(input: string) {
  return /@/.test(input);
}

function newLocalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUsername(input: string) {
  const raw = String(input ?? "").trim().toLowerCase();
  const cleaned = raw
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_\-.]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 24);
  return cleaned || "user";
}

function usernameFromEmail(email: string) {
  const local = String(email).split("@")[0] ?? "user";
  return normalizeUsername(local);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token] = useState<string | null>(null);

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

  const ensureDbReady = useCallback(async () => {
    const existing = await readDb();
    const seeded = await seedDbIfNeeded(existing as any);
    return seeded;
  }, []);

  const setSessionUserId = useCallback(
    async (nextUserId: string) => {
      setUserId(nextUserId);
      await AsyncStorage.setItem(KEY, nextUserId);
      // best-effort refresh
      try {
        const db = await readDb();
        setCurrentUser((db as any)?.users?.[String(nextUserId)] ?? null);
      } catch {
        // ignore
      }
    },
    []
  );

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
    await ensureDbReady();
    await setSessionUserId(DEV_USER_ID);
    // currentUser will be refreshed by effect
  }, [ensureDbReady, setSessionUserId]);

  const signIn = useCallback(
    async (args: { identifier: string; password: string }) => {
      const ident = normalizeIdentifier(args.identifier);
      const pw = String(args.password ?? "");
      if (!ident) return { ok: false as const, error: "Missing identifier." };
      if (!pw) return { ok: false as const, error: "Missing password." };

      await ensureDbReady();

      const db = await readDb();
      const users = (db as any)?.users ?? {};

      let matched: any | null = null;
      for (const u of Object.values(users) as any[]) {
        const username = normalizeIdentifier(u?.username);
        const email = normalizeIdentifier(u?.email);
        if (username && username === ident) {
          matched = u;
          break;
        }
        if (email && email === ident) {
          matched = u;
          break;
        }
      }

      if (!matched) return { ok: false as const, error: "Account not found." };

      // Local-only auth behavior:
      // - If passwordHash exists, it must match.
      // - If it doesn't exist (seeded/mocked users), we accept the first password and store it.
      const existingHash = typeof matched.passwordHash === "string" ? matched.passwordHash : "";
      if (existingHash) {
        if (!verifyPassword(pw, existingHash)) return { ok: false as const, error: "Invalid password." };
      } else {
        const id = String(matched.id);
        const now = nowIso();
        await updateDb((prev) => {
          const existing = (prev as any).users?.[id];
          if (!existing) return prev;
          return {
            ...prev,
            users: {
              ...(prev as any).users,
              [id]: {
                ...existing,
                passwordHash: hashPassword(pw),
                // if they logged in with email, keep it for future
                email: isProbablyEmail(ident) ? ident : existing.email,
                updatedAt: now,
              },
            },
          };
        });
      }

      await setSessionUserId(String(matched.id));
      return { ok: true as const };
    },
    [ensureDbReady, setSessionUserId]
  );

  const signUp = useCallback(
    async (args: { email: string; password: string; username?: string; name?: string }) => {
      const email = normalizeIdentifier(args.email);
      const pw = String(args.password ?? "");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false as const, error: "Please enter a valid email address." };
      }
      if (!pw) return { ok: false as const, error: "Missing password." };

      await ensureDbReady();
      const db = await readDb();
      const users = (db as any)?.users ?? {};

      for (const u of Object.values(users) as any[]) {
        if (normalizeIdentifier(u?.email) === email) {
          return { ok: false as const, error: "An account with this email already exists." };
        }
      }

      const taken = new Set<string>();
      for (const u of Object.values(users) as any[]) taken.add(normalizeIdentifier(u?.username));

      const base = normalizeUsername(args.username ?? usernameFromEmail(email));
      let uname = base;
      let i = 2;
      while (taken.has(normalizeIdentifier(uname))) {
        uname = `${base}${i}`;
        i++;
      }

      const id = newLocalId("u");
      const now = nowIso();
      const avatarUrl = `https://i.pravatar.cc/150?u=${encodeURIComponent(id)}`;

      await updateDb((prev) => {
        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [id]: {
              id,
              username: uname,
              name: typeof args.name === "string" ? args.name : undefined,
              email,
              passwordHash: hashPassword(pw),
              avatarUrl,
              settings: {},
              createdAt: now,
              updatedAt: now,
            },
          },
        };
      });

      await setSessionUserId(id);
      return { ok: true as const };
    },
    [ensureDbReady, setSessionUserId]
  );

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

  const updateUsername = useCallback(
    async (username: string) => {
      if (!userId) throw new Error("Not logged in");

      const normalized = normalizeUsernameInput(username);
      if (!normalized) throw new Error("Please enter a valid username.");

      const db = await readDb();
      const users = (db as any)?.users ?? {};

      // enforce uniqueness (case-insensitive)
      const nextLower = String(normalized).toLowerCase();
      for (const u of Object.values(users) as any[]) {
        if (!u) continue;
        if (String(u.id) === String(userId)) continue;
        const uname = String(u.username ?? "").trim().toLowerCase();
        if (uname && uname === nextLower) {
          throw new Error("That username is already taken.");
        }
      }

      const id = String(userId);
      const now = nowIso();
      const nextDb = await updateDb((prev) => {
        const existing = (prev as any).users?.[id];
        if (!existing) return prev;
        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [id]: {
              ...existing,
              username: normalized,
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
      token,

      currentUser,

      signInMock,
      signIn,
      signUp,
      signOut,

      refreshCurrentUser,
      updateUserSettings,
      updateUserAvatar,
      updateUsername,
    }),
    [
      authReady,
      userId,
      token,
      currentUser,
      signInMock,
      signIn,
      signUp,
      signOut,
      refreshCurrentUser,
      updateUserSettings,
      updateUserAvatar,
      updateUsername,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}