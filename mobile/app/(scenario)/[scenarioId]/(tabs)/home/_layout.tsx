// mobile/app/(scenario)/[scenarioId]/(tabs)/index/_layout.tsx
import { Stack } from "expo-router";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function HomeTabLayout() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="post/[postId]" />
      <Stack.Screen name="profile/[profileId]" />
      <Stack.Screen name="sheet/[profileId]" />
    </Stack>
  );
}