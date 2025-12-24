// mobile/app/(scenario)/[scenarioId]/(tabs)/messages.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function MessagesScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="mail-outline" size={28} color={colors.tint} />
        </View>

        <ThemedText style={[styles.title, { color: colors.text }]}>
          messages are coming soon
        </ThemedText>

        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          private conversations per profile will live here. for now, your inbox is empty — on purpose.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardRow}>
            <Ionicons name="sparkles-outline" size={18} color={colors.textSecondary} />
            <ThemedText style={[styles.cardText, { color: colors.textSecondary }]}>
              plan: per-scenario inbox, profile switching, and dm requests.
            </ThemedText>
          </View>
        </View>

        <Pressable
          onPress={() => {}}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.text, opacity: pressed ? 0.86 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Coming soon"
        >
          <ThemedText style={{ color: colors.background, fontWeight: "900" }}>coming soon</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 20, textAlign: "center", maxWidth: 320, marginTop: 2 },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 6,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardText: { fontSize: 13, lineHeight: 18, flex: 1 },
  primaryBtn: {
    marginTop: 10,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
