import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/auth';
import { NavDarkTheme, NavLightTheme } from '@/constants/navigation-theme';
import { ProfileProvider } from '@/context/profile';

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
    <AuthProvider>
      <ProfileProvider>
        <ThemeProvider value={colorScheme === 'dark' ? NavDarkTheme : NavLightTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </ThemeProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}