// mobile/app/_layout.tsx
import React, { useEffect, useMemo } from "react";
import { ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/context/auth";
import { AppDataProvider } from "@/context/appData";
import NotificationBanner from "@/components/ui/NotificationBanner";
import { DialogProvider } from "@/context/dialog";
import { NavDarkTheme, NavLightTheme } from "@/constants/navigation-theme";
import { Colors } from "@/constants/theme";

import { ThemeProvider as AppThemeProvider, DarkMode } from "@/context/theme";

function AuthGate() {
  const { isReady, isLoggedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  useEffect(() => {
    if (!isReady) return;

    const inAuth = segments[0] === "(auth)";

    if (!isLoggedIn && !inAuth) {
      router.replace("/(auth)/login" as any);
      return;
    }

    if (isLoggedIn && inAuth) {
      router.replace("/" as any);
      return;
    }
  }, [isReady, isLoggedIn, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

function AppShell() {
  const { currentUser } = useAuth();

  const mode = useMemo<DarkMode>(() => {
    const m = currentUser?.settings?.darkMode;
    return m === "light" || m === "dark" || m === "system" ? m : "system";
  }, [currentUser?.settings?.darkMode]);

  return (
    <AppThemeProvider mode={mode}>
      <ThemedNavigation />
    </AppThemeProvider>
  );
}

function ThemedNavigation() {
  const scheme = useColorScheme() ?? "light";

  return (
    <NavThemeProvider value={scheme === "dark" ? NavDarkTheme : NavLightTheme}>
      <AuthGate />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  return (
    <DialogProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <AuthProvider>
          <AppDataProvider>
            <AppShell />
            <NotificationBanner />
          </AppDataProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </DialogProvider>
  );
}