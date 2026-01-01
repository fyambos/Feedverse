// mobile/app/(scenario)/[scenarioId]/_layout.tsx
import { Stack } from "expo-router";

export default function ScenarioLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}