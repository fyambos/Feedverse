// mobile/app/(scenario)/[scenarioId]/_layout.tsx

import React from "react";
import { Stack } from "expo-router";

export default function ScenarioLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Tabs stay as the main screen */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* These are now real stack screens (swipe-back works) */}
      <Stack.Screen name="profile/[profileId]" options={{ headerShown: false }} />
      <Stack.Screen name="post/[postId]" options={{ headerShown: false }} />
      <Stack.Screen name="sheet/[profileId]" options={{ headerShown: false }} />
    </Stack>
  );
}