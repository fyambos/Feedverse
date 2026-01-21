import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Alert } from "@/context/dialog";

function CheckboxRow({
  label,
  checked,
  onToggle,
  color,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <Ionicons
        name={checked ? "checkbox-outline" : "square-outline"}
        size={22}
        color={color}
      />
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export default function ExportScenarioModal() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const params = useLocalSearchParams<{ scenarioId?: string }>();
  const scenarioId = String(params?.scenarioId ?? "").trim();

  const app = useAppData() as any;

  const [includeProfiles, setIncludeProfiles] = useState(true);
  const [includePosts, setIncludePosts] = useState(true);
  const [busy, setBusy] = useState(false);

  const subtitle = useMemo(() => {
    if (includeProfiles && includePosts) return "Exports scenario settings, profiles, and posts.";
    if (includeProfiles) return "Exports scenario settings and profiles.";
    if (includePosts) return "Exports scenario settings and posts.";
    return "Exports scenario settings only.";
  }, [includeProfiles, includePosts]);

  const onClose = useCallback(() => {
    try {
      router.back();
    } catch {
      try {
        router.replace("/" as any);
      } catch {}
    }
  }, []);

  const onExport = useCallback(async () => {
    if (busy) return;
    if (!scenarioId) {
      Alert.alert("Missing scenario", "No scenarioId provided.");
      return;
    }

    setBusy(true);
    try {
      const res = await app.exportScenarioToFile({
        scenarioId,
        includeProfiles,
        includePosts,
      });

      if (!res?.ok) {
        Alert.alert("Export failed", res?.error ?? "Could not export.");
        return;
      }

      Alert.alert(
        "Exported!",
        `file: ${res.filename}\nprofiles: ${res.counts.profiles}\nposts: ${res.counts.posts}`
      );

      onClose();
    } finally {
      setBusy(false);
    }
  }, [app, busy, scenarioId, includeProfiles, includePosts, onClose]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: colors.text }]}>Export</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <CheckboxRow
            label="Profiles"
            checked={includeProfiles}
            onToggle={() => setIncludeProfiles((v) => !v)}
            color={colors.tint}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CheckboxRow
            label="Posts"
            checked={includePosts}
            onToggle={() => setIncludePosts((v) => !v)}
            color={colors.tint}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.8 },
              busy && { opacity: 0.6 },
            ]}
          >
            <ThemedText style={{ color: colors.text, fontWeight: "700" }}>Cancel</ThemedText>
          </Pressable>

          <Pressable
            onPress={onExport}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              styles.primaryBtn,
              { backgroundColor: colors.text },
              pressed && { opacity: 0.85 },
              busy && { opacity: 0.6 },
            ]}
          >
            <ThemedText style={{ color: colors.background, fontWeight: "800" }}>
              {busy ? "Exporting…" : "Export"}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 18 },

  header: { gap: 6 },
  title: { fontSize: 22, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 18 },

  card: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth },

  actions: { marginTop: "auto", flexDirection: "row", gap: 12 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primaryBtn: { borderWidth: 0 },
});
