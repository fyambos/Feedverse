//mobile/app/_layout.tsx
import React, { useEffect } from 'react';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/auth';
import { NavDarkTheme, NavLightTheme } from '@/constants/navigation-theme';
import { AppDataProvider } from '@/context/appData';
function AuthGate() {
  const { isReady, isLoggedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;

    const inAuth = segments[0] === '(auth)';

    if (!isLoggedIn && !inAuth) {
      router.replace('/(auth)/login' as any);
      return;
    }

    if (isLoggedIn && inAuth) {
      router.replace('/' as any);
      return;
    }
  }, [isReady, isLoggedIn, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppDataProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
            <ThemeProvider value={colorScheme === 'dark' ? NavDarkTheme : NavLightTheme}>
              <AuthGate />
              <StatusBar style="auto" />
            </ThemeProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </AppDataProvider>
  );
}