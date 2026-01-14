import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function UserNotFoundScreen() {
  const { scenarioId, handle } = useLocalSearchParams<{ scenarioId: string; handle?: string }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const h = String(handle ?? "").trim().replace(/^@+/, "");

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.center}>
        <ThemedText style={[styles.title, { color: colors.text }]}>User doesn’t exist</ThemedText>
        <ThemedText style={[styles.body, { color: colors.textSecondary }]}>No profile found for @{h || "unknown"} in this scenario.</ThemedText>

        <Pressable
          onPress={() => {
            if (!sid) return;
            router.push({
              pathname: `/(scenario)/${encodeURIComponent(sid)}/(tabs)/search`,
              params: { q: h ? `@${h}` : "" },
            } as any);
          }}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.85 },
          ]}
        >
          <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>Search</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
        >
          <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>Go back</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, gap: 10 },
  title: { fontSize: 22, fontWeight: "900" },
  body: { fontSize: 15, textAlign: "center" },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 8 },
});
