import { Tabs, router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, Platform, Pressable } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

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
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

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
          headerTitle: () => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/modal/select-profile",
                  params: { scenarioId: String(scenarioId) },
                } as any)
              }
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Switch Profile"
            >
              <Image
                source={require("@/assets/images/FeedverseIcon.png")}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </Pressable>
          ),
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="house.fill" androidIonicon="home" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: "",
          headerTitle: "Search",
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="magnifyingglass" androidIonicon="search" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "",
          headerTitle: "Notifications",
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="bell.fill" androidIonicon="notifications" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: "",
          headerTitle: "Direct Messages",
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="envelope.fill" androidIonicon="mail" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="post/[postId]"
        options={{
          href: null,
          title: "Post",
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <Tabs.Screen
        name="profile/[handle]"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
