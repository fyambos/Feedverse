// mobile/app/(scenario)/[scenarioId]/(tabs)/_layout.tsx
import React, { useEffect, useMemo } from "react";
import { Alert, Image, Platform, Pressable } from "react-native";
import {
  Tabs,
  router,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/auth";
import { createScenarioIO } from "@/lib/scenarioIO";

function TabIcon({
  iosName,
  androidIonicon,
  color,
  size = 28,
}: {
  iosName: string;
  androidIonicon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  if (Platform.OS === "ios") {
    return <IconSymbol size={size} name={iosName as any} color={color} />;
  }
  return <Ionicons name={androidIonicon} size={size} color={color} />;
}

/**
 * Extracts the scenarioId from a pathname like:
 * "/demo-kpop", "/demo-kpop/home", "/demo-kpop/home/post/123"
 */
function scenarioIdFromPathname(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return String(first ?? "").trim();
}

export default function TabLayout() {
  const pathname = usePathname();
  const segments = useSegments();

  // ✅ if available, prefer params (more correct than pathname)
  const params = useLocalSearchParams<{ scenarioId?: string }>();

  const gateRanRef = React.useRef<string | null>(null);

  // ✅ keep last valid scenario id so /modal/* doesn't turn sid into "modal"
  const lastSidRef = React.useRef<string>("");

  // ✅ reliable sid for layouts (handles modal routes safely)
  const sid = useMemo(() => {
    const fromParams =
      typeof params?.scenarioId === "string" ? params.scenarioId.trim() : "";

    if (fromParams) {
      lastSidRef.current = fromParams;
      return fromParams;
    }

    // if we're in a modal route, keep the last scenario id
    if (pathname.startsWith("/modal")) {
      return lastSidRef.current;
    }

    // fallback
    const fromPath = scenarioIdFromPathname(pathname);
    if (fromPath && fromPath !== "modal") {
      lastSidRef.current = fromPath;
      return fromPath;
    }

    return lastSidRef.current;
  }, [params?.scenarioId, pathname]);

  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const { userId } = useAuth();
  const app = useAppData() as any;
  const { isReady, db, getProfileById, getSelectedProfileId } = app;

  const selectedProfileId = useMemo(
    () => (sid ? getSelectedProfileId?.(sid) ?? null : null),
    [getSelectedProfileId, sid]
  );

  const selectedProfile = useMemo(
    () =>
      selectedProfileId ? getProfileById?.(String(selectedProfileId)) : null,
    [getProfileById, selectedProfileId]
  );

  const io = useMemo(() => {
    return createScenarioIO({
      isReady,
      userId,
      db,
      previewImportScenarioFromFile: app.previewImportScenarioFromFile,
      importScenarioFromFile: app.importScenarioFromFile,
      exportScenarioToFile: app.exportScenarioToFile,
      onImportedNavigate: (newScenarioId: string) => {
        router.replace({
          pathname: "/(scenario)/[scenarioId]",
          params: { scenarioId: newScenarioId },
        } as any);
      },
    });
  }, [
    isReady,
    userId,
    db,
    app.previewImportScenarioFromFile,
    app.importScenarioFromFile,
    app.exportScenarioToFile,
  ]);

  // ✅ HEADER BUG FIX:
  // Hide the Tabs header (avatar + Feedverse icon) on profile & post detail screens.
  // Works whether your nested routes live under /home/... or /index/...
  const hideTabsHeader = useMemo(() => {
    return (
      pathname.includes("/home/profile/") ||
      pathname.includes("/home/post/") ||
      pathname.includes("/index/profile/") ||
      pathname.includes("/index/post/")
    );
  }, [pathname]);

  // ---- GATE: force create/select profile when entering a scenario ----
  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;

    // ✅ do NOT gate while a modal is open (prevents "modal" sid bugs / hijacks)
    if (pathname.startsWith("/modal")) return;

    // 🧠 run ONCE per scenario
    if (gateRanRef.current === sid) return;

    if (selectedProfileId) {
      gateRanRef.current = sid;
      return;
    }

    const uid = String(userId ?? "").trim();
    const profilesMap = (db as any)?.profiles ?? {};

    const hasAnyProfileInScenario = Object.values(profilesMap).some((p: any) => {
      return String(p?.scenarioId) === sid && String(p?.ownerUserId) === uid;
    });

    gateRanRef.current = sid; // 🔒 lock BEFORE navigating

    if (hasAnyProfileInScenario) {
      router.replace({
        pathname: "/modal/select-profile",
        params: { scenarioId: sid, forced: "1" },
      } as any);
    } else {
      router.replace({
        pathname: "/modal/create-profile",
        params: { scenarioId: sid, mode: "create", forced: "1" },
      } as any);
    }
  }, [isReady, sid, selectedProfileId, userId, db, pathname]);

  const exportThisScenario = () => {
    if (!sid) return;
    io.openExportChoice?.(sid);
  };

  const openScenarioMenu = () => {
    const profileId = selectedProfile?.id ? String(selectedProfile.id) : null;

    Alert.alert("Scenario menu", "", [
      {
        text: "Profile",
        onPress: () => {
          if (!profileId) {
            Alert.alert("No profile selected", "Select a profile first.");
            return;
          }
          router.push(
            `/(scenario)/${encodeURIComponent(
              sid
            )}/(tabs)/home/profile/${encodeURIComponent(profileId)}` as any
          );
        },
      },
      {
        text: "View Settings",
        onPress: () => {
          router.push({
            pathname: "/modal/create-scenario",
            params: { scenarioId: sid },
          } as any);
        },
      },
      { text: "Export…", onPress: exportThisScenario },
      {
        text: "Back to home",
        onPress: () => {
          try {
            router.dismissAll();
          } catch {}
          router.replace("/" as any);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: !hideTabsHeader, // ✅ 핵심: hide on profile/post detail
        headerTitleAlign: "center",
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "",
          headerLeft: () => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/modal/select-profile",
                  params: { scenarioId: sid },
                } as any)
              }
              hitSlop={12}
              style={({ pressed }) => [
                { opacity: pressed ? 0.7 : 1, marginLeft: 12 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Switch Profile"
            >
              <Avatar
                uri={selectedProfile?.avatarUrl ?? null}
                size={30}
                fallbackColor={colors.border}
              />
            </Pressable>
          ),
          headerTitle: () => (
            <Pressable
              onPress={openScenarioMenu}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Scenario menu"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Image
                source={require("@/assets/images/FeedverseIcon.png")}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </Pressable>
          ),
          tabBarIcon: ({ color }) => (
            <TabIcon
              iosName="house.fill"
              androidIonicon="home"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: "",
          headerTitle: "Search",
          tabBarIcon: ({ color }) => (
            <TabIcon
              iosName="magnifyingglass"
              androidIonicon="search"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "",
          headerTitle: "Notifications",
          tabBarIcon: ({ color }) => (
            <TabIcon
              iosName="bell.fill"
              androidIonicon="notifications"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: "",
          headerTitle: "Direct Messages",
          tabBarIcon: ({ color }) => (
            <TabIcon
              iosName="envelope.fill"
              androidIonicon="mail"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}