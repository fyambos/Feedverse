// mobile/app/(scenario)/[scenarioId]/(tabs)/index/_layout.tsx
import { Stack } from "expo-router";

export default function HomeTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="post/[postId]" />
      <Stack.Screen name="profile/[profileId]" />
      <Stack.Screen name="sheet/[profileId]" />
    </Stack>
  );
}