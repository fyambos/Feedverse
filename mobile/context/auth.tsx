//mobile/context/auth.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthState = {
  isReady: boolean;
  isLoggedIn: boolean;
  userId: string | null;
  signInMock: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const KEY = 'feedverse.auth.userId';
const DEV_USER_ID = 'u14';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const storedUserId = await AsyncStorage.getItem(KEY);
      setUserId(storedUserId);
      setIsReady(true);
    })();
  }, []);

  const signInMock = async () => {
    setUserId(DEV_USER_ID);
    await AsyncStorage.setItem(KEY, DEV_USER_ID);
  };

  const signOut = async () => {
    setUserId(null);
    await AsyncStorage.removeItem(KEY);
  };

  const value = useMemo(
    () => ({
      isReady,
      isLoggedIn: !!userId,
      userId,
      signInMock,
      signOut,
    }),
    [isReady, userId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}