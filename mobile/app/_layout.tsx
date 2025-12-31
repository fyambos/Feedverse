import React, { useEffect } from "react";
import { ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/context/auth";
import { NavDarkTheme, NavLightTheme } from "@/constants/navigation-theme";
import { AppDataProvider } from "@/context/appData";
import { Colors } from "@/constants/theme";

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

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme]; 

  return (
    <AppDataProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <AuthProvider>
          <ThemeProvider value={colorScheme === "dark" ? NavDarkTheme : NavLightTheme}>
            <AuthGate />
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          </ThemeProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </AppDataProvider>
  );
}