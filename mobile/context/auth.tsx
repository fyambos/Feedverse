import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthState = {
  isReady: boolean;
  isLoggedIn: boolean;
  signInMock: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const KEY = 'feedverse.auth.loggedIn';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem(KEY);
      setIsLoggedIn(v === '1');
      setIsReady(true);
    })();
  }, []);

  const signInMock = async () => {
    setIsLoggedIn(true);
    await AsyncStorage.setItem(KEY, '1');
  };

  const signOut = async () => {
    setIsLoggedIn(false);
    await AsyncStorage.removeItem(KEY);
  };

  const value = useMemo(() => ({ isReady, isLoggedIn, signInMock, signOut }), [isReady, isLoggedIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}