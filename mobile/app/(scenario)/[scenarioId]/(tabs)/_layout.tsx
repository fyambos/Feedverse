// mobile/app/(scenario)/[scenarioId]/(tabs)/_layout.tsx
import { Tabs, router, useLocalSearchParams, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { Alert, Image, Platform, Pressable } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/auth";

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

export default function TabLayout() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? "");

  const segments = useSegments();

  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const { userId } = useAuth();
  const { isReady, db, getProfileById, getSelectedProfileId } = useAppData() as any;

  const selectedProfileId = getSelectedProfileId?.(sid) ?? null;
  const selectedProfile = selectedProfileId ? getProfileById(String(selectedProfileId)) : null;

  // ---- GATE: force create/select profile when entering a scenario ----
  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;

    const path = segments.join("/");
    const inProfileSetupModal =
      path.includes("modal/create-profile") || path.includes("modal/select-profile");

    if (inProfileSetupModal) return;

    if (selectedProfileId) return;

    const uid = String(userId ?? "").trim();
    const profilesMap = (db as any)?.profiles ?? {};
    const hasAnyProfileInScenario = Object.values(profilesMap).some((p: any) => {
      return String(p?.scenarioId) === sid && String(p?.ownerUserId) === uid;
    });

    if (hasAnyProfileInScenario) {
      router.replace({
        pathname: "/modal/select-profile",
        params: { scenarioId: sid, forced: "1" },
      } as any);
      return;
    }

    router.replace({
      pathname: "/modal/create-profile",
      params: { scenarioId: sid, mode: "create", forced: "1" },
    } as any);
  }, [isReady, sid, selectedProfileId, segments, db, userId]);

  // Scenario menu
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
            `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(profileId)}` as any
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

      {
        text: "Back to home",
        onPress: () => {
          try {
            router.dismissAll();
          } catch {}
          router.replace("/" as any);
        },
      },

      {
        text: "More",
        onPress: () => {
          Alert.alert("More", "", [
            {
              text: "Import (coming soon)",
              onPress: () => Alert.alert("Coming soon", "Import is not available yet."),
            },
            {
              text: "Export (coming soon)",
              onPress: () => Alert.alert("Coming soon", "Export is not available yet."),
            },
            { text: "Cancel", style: "cancel" },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: true,
        headerTitleAlign: "center",
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
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
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, marginLeft: 12 }]}
              accessibilityRole="button"
              accessibilityLabel="Switch Profile"
            >
              <Avatar uri={selectedProfile?.avatarUrl ?? null} size={30} fallbackColor={colors.border} />
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

          tabBarIcon: ({ color }) => <TabIcon iosName="house.fill" androidIonicon="home" color={color} />,
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: "",
          headerTitle: "Search",
          tabBarIcon: ({ color }) => <TabIcon iosName="magnifyingglass" androidIonicon="search" color={color} />,
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "",
          headerTitle: "Notifications",
          tabBarIcon: ({ color }) => <TabIcon iosName="bell.fill" androidIonicon="notifications" color={color} />,
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: "",
          headerTitle: "Direct Messages",
          tabBarIcon: ({ color }) => <TabIcon iosName="envelope.fill" androidIonicon="mail" color={color} />,
        }}
      />

      <Tabs.Screen name="post/[postId]" options={{ href: null }} />
      <Tabs.Screen name="profile/[profileId]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="sheet/[profileId]" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}