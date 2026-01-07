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
import { apiFetch, setAuthInvalidationHandler } from "@/lib/apiClient";
import { Alert } from "@/context/dialog";

type AuthState = {
  isReady: boolean;
  isLoggedIn: boolean;
  userId: string | null;
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

  fetchWithAuth: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ ok: boolean; status: number; json: any; text: string }>;

  refreshCurrentUser: () => Promise<void>;
  updateUserSettings: (settings: UserSettings) => Promise<void>;
  updateUserAvatar: (avatarUrl?: string | null) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const KEY = "feedverse.auth.userId";
const TOKEN_KEY = "feedverse.auth.token";
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

function apiBaseUrl() {
  const raw = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  return raw.replace(/\/$/, "");
}

function mapBackendUserToLocal(u: any): User {
  const now = nowIso();
  const id = String(u?.id ?? "");
  return {
    id,
    username: String(u?.username ?? "user"),
    name: u?.name ? String(u.name) : undefined,
    email: u?.email ? String(u.email) : undefined,
    avatarUrl: String(u?.avatar_url ?? u?.avatarUrl ?? "") || `https://i.pravatar.cc/150?u=${encodeURIComponent(id || now)}`,
    createdAt: u?.created_at ? new Date(u.created_at).toISOString() : now,
    updatedAt: u?.updated_at ? new Date(u.updated_at).toISOString() : now,
    settings: {},
  };
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
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const authInvalidatedRef = React.useRef(false);

  // hydrate stored auth id once
  useEffect(() => {
    (async () => {
      const storedUserId = await AsyncStorage.getItem(KEY);
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);

      const baseUrl = apiBaseUrl();

      // If backend mode is configured, we require a token.
      // Otherwise the app can appear "logged in" locally but silently skip server writes.
      if (baseUrl && storedUserId && !storedToken) {
        await AsyncStorage.removeItem(KEY);
        setUserId(null);
        setToken(null);
        setAuthReady(true);
        try {
          Alert.alert("Session expired", "Please sign in again.");
        } catch {
          // ignore
        }
        return;
      }

      setUserId(storedUserId);
      setToken(storedToken);
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

  const setSessionToken = useCallback(async (nextToken: string | null) => {
    setToken(nextToken);
    if (nextToken) await AsyncStorage.setItem(TOKEN_KEY, nextToken);
    else await AsyncStorage.removeItem(TOKEN_KEY);

    // New token means we can show session-expired again next time.
    authInvalidatedRef.current = false;
  }, []);

  const fetchWithAuth = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await apiFetch({ path, token, init });
      return res;
    },
    [token]
  );

  // If backend auth is enabled, refresh /users/profile and keep local user record in sync.
  useEffect(() => {
    if (!authReady) return;
    if (!userId || !token) return;
    if (!apiBaseUrl()) return;

    let cancelled = false;

    (async () => {
      let res:
        | { ok: boolean; status: number; json: any; text: string }
        | null = null;
      try {
        res = await fetchWithAuth("/users/profile");
      } catch {
        // Backend is offline / network error.
        return;
      }
      if (cancelled) return;

      // If the token is no longer valid, force re-login.
      if (res && (res.status === 401 || (res.status === 403 && /token de connexion invalide|invalide ou expir/i.test(String(res.text ?? ""))))) {
        await AsyncStorage.removeItem(KEY);
        await AsyncStorage.removeItem(TOKEN_KEY);
        setUserId(null);
        setToken(null);
        setCurrentUser(null);
        return;
      }

      if (!res || !res.ok || !res.json) return;

      const backendUser = res.json;
      const uid = String(backendUser?.id ?? "").trim();
      if (!uid) return;

      const localUser = mapBackendUserToLocal(backendUser);
      await updateDb((prev) => {
        const existing = (prev as any).users?.[uid];
        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [uid]: {
              ...(existing ?? {}),
              ...localUser,
              id: uid,
            },
          },
        };
      });

      // keep currentUser fresh if this is the active user
      if (String(userId) === uid) {
        try {
          const db = await readDb();
          setCurrentUser((db as any)?.users?.[uid] ?? null);
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, userId, token, fetchWithAuth]);

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
      const baseUrl = apiBaseUrl();
      const ident = normalizeIdentifier(args.identifier);
      const pw = String(args.password ?? "");
      if (!ident) return { ok: false as const, error: "Missing identifier." };
      if (!pw) return { ok: false as const, error: "Missing password." };

      if (baseUrl) {
        try {
          const res = await apiFetch({
            path: "/auth/login",
            init: {
              method: "POST",
              body: JSON.stringify({ email: ident, password_hash: pw }),
            },
          });

          const json = res.json;
          if (!res.ok) return { ok: false as const, error: String(json?.message ?? "Login failed.") };

          const nextToken = String(json?.token ?? "").trim();
          const user = json?.user;
          const uid = String(user?.id ?? "").trim();
          if (!nextToken || !uid) {
            return { ok: false as const, error: "Login response missing token or user." };
          }

          await ensureDbReady();
          const localUser = mapBackendUserToLocal(user);
          await updateDb((prev) => {
            const existing = (prev as any).users?.[uid];
            return {
              ...prev,
              users: {
                ...(prev as any).users,
                [uid]: {
                  ...(existing ?? {}),
                  ...localUser,
                  id: uid,
                },
              },
            };
          });

          await setSessionToken(nextToken);
          await setSessionUserId(uid);
          return { ok: true as const };
        } catch {
          return { ok: false as const, error: "Unable to reach server." };
        }
      }

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
    [ensureDbReady, setSessionUserId, setSessionToken]
  );

  const signUp = useCallback(
    async (args: { email: string; password: string; username?: string; name?: string }) => {
      const baseUrl = apiBaseUrl();
      const email = normalizeIdentifier(args.email);
      const pw = String(args.password ?? "");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false as const, error: "Please enter a valid email address." };
      }
      if (!pw) return { ok: false as const, error: "Missing password." };

      if (baseUrl) {
        try {
          const res = await apiFetch({
            path: "/auth/register",
            init: {
              method: "POST",
              body: JSON.stringify({
                email,
                password_hash: pw,
                username: String(args.username ?? usernameFromEmail(email)),
                name: String(args.name ?? ""),
                avatar_url: "",
              }),
            },
          });

          const json = res.json;
          if (!res.ok) {
            if (Array.isArray(json?.errors) && json.errors.length > 0) {
              const msg = String(json.errors?.[0]?.message ?? "Sign up failed.");
              return { ok: false as const, error: msg };
            }
            return {
              ok: false as const,
              error: String(json?.error ?? json?.message ?? "Sign up failed."),
            };
          }

          if (Array.isArray(json?.errors) && json.errors.length > 0) {
            const msg = String(json.errors?.[0]?.message ?? "Sign up failed.");
            return { ok: false as const, error: msg };
          }

          // server returns token+user; if not, fall back to login
          const nextToken = String(json?.token ?? "").trim();
          const user = json?.user;
          const uid = String(user?.id ?? "").trim();

          if (nextToken && uid) {
            await ensureDbReady();
            const localUser = mapBackendUserToLocal(user);
            await updateDb((prev) => {
              const existing = (prev as any).users?.[uid];
              return {
                ...prev,
                users: {
                  ...(prev as any).users,
                  [uid]: {
                    ...(existing ?? {}),
                    ...localUser,
                    id: uid,
                  },
                },
              };
            });

            await setSessionToken(nextToken);
            await setSessionUserId(uid);
            return { ok: true as const };
          }

          // fallback: login
          return await signIn({ identifier: email, password: pw });
        } catch {
          return { ok: false as const, error: "Unable to reach server." };
        }
      }

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
    [ensureDbReady, setSessionUserId, setSessionToken, signIn]
  );

  const signOut = useCallback(async () => {
    setUserId(null);
    setToken(null);
    setCurrentUser(null);
    await AsyncStorage.removeItem(KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
    authInvalidatedRef.current = false;
  }, []);

  // Global handler: on any 401/403 from authenticated apiFetch, force sign-out.
  useEffect(() => {
    setAuthInvalidationHandler(async () => {
      if (authInvalidatedRef.current) return;
      authInvalidatedRef.current = true;
      await signOut();
      Alert.alert("Session expired", "Please sign in again.");
    });

    return () => {
      setAuthInvalidationHandler(null);
    };
  }, [signOut]);

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

      // Backend mode: if avatarUrl is a local file uri, upload it and persist the returned public URL.
      const baseUrl = apiBaseUrl();
      const t = String(token ?? "").trim();
      const raw = avatarUrl == null ? null : String(avatarUrl);
      const looksLocalFile = !!raw && !/^https?:\/\//i.test(raw);

      if (baseUrl && t && looksLocalFile) {
        const form = new FormData();
        const name = `avatar_${id}_${Date.now()}.jpg`;

        // React Native expects { uri, name, type }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.append("avatar", { uri: raw, name, type: "image/jpeg" } as any);

        const res = await apiFetch({
          path: "/users/avatar",
          token: t,
          init: {
            method: "POST",
            body: form as any,
          },
        });

        if (!res.ok) {
          const msg =
            typeof (res.json as any)?.error === "string"
              ? String((res.json as any).error)
              : typeof res.text === "string" && res.text.trim().length
                ? res.text
                : `Upload failed (HTTP ${res.status})`;
          throw new Error(msg);
        }

        const uploadedUrl = String((res.json as any)?.avatarUrl ?? "").trim();
        if (uploadedUrl) avatarUrl = uploadedUrl;
      }

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
    [userId, token]
  );

  // Update username via backend
  const updateUsername = useCallback(
    async (username: string) => {
      if (!userId) throw new Error("Not logged in");
      const baseUrl = apiBaseUrl();
      const t = String(token ?? "").trim();
      if (!baseUrl || !t) throw new Error("No backend or token");
      const res = await apiFetch({
        path: "/users/username",
        token: t,
        init: {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      });
      if (!res.ok) {
        const msg = typeof (res.json as any)?.error === "string"
          ? String((res.json as any).error)
          : typeof res.text === "string" && res.text.trim().length
            ? res.text
            : `Update failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      // Update local user cache
      await updateDb((prev) => {
        const existing = (prev as any).users?.[userId];
        if (!existing) return prev;
        return {
          ...prev,
          users: {
            ...(prev as any).users,
            [userId]: {
              ...existing,
              username,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });
      await refreshCurrentUser();
    },
    [userId, token, refreshCurrentUser]
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

      fetchWithAuth,

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
      fetchWithAuth,
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