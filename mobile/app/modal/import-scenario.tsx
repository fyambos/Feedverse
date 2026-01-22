import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
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
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && { opacity: 0.75 }, disabled && { opacity: 0.55 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <Ionicons name={checked ? "checkbox-outline" : "square-outline"} size={22} color={color} />
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export default function ImportScenarioModal() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const app = useAppData() as any;

  const [includeProfiles, setIncludeProfiles] = useState(true);
  const [includePosts, setIncludePosts] = useState(true);
  const [includeSheets, setIncludeSheets] = useState(true);

  // Backend import currently ignores likes + reposts, so we keep this off.
  const includeReposts = false;

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<null | {
    fileName?: string;
    jsonBytes: number;
    importedProfiles: number;
    importedPosts: number;
    importedSheets: number;
  }>(null);

  const effectiveIncludeProfiles = includeProfiles || includePosts || includeSheets;

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (effectiveIncludeProfiles) parts.push("profiles");
    if (includePosts) parts.push("posts");
    if (includeSheets) parts.push("sheets");

    const what = parts.length ? parts.join(", ") : "scenario settings only";
    return `Creates a new scenario and imports: ${what}.\n\nNote: likes and reposts are ignored.`;
  }, [effectiveIncludeProfiles, includePosts, includeSheets]);

  const onClose = useCallback(() => {
    try {
      router.back();
    } catch {
      try {
        router.replace("/" as any);
      } catch {}
    }
  }, []);

  const toggleProfiles = useCallback(() => {
    setIncludeProfiles((v) => {
      const next = !v;
      // If turning profiles off, also turn off dependent sections.
      if (!next) {
        setIncludePosts(false);
        setIncludeSheets(false);
      }
      return next;
    });
  }, []);

  const togglePosts = useCallback(() => {
    setIncludePosts((v) => {
      const next = !v;
      if (next) setIncludeProfiles(true);
      return next;
    });
  }, []);

  const toggleSheets = useCallback(() => {
    setIncludeSheets((v) => {
      const next = !v;
      if (next) setIncludeProfiles(true);
      return next;
    });
  }, []);

  const pickAndPreview = useCallback(async () => {
    if (busy) return;

    setBusy(true);
    try {
      const res = await app.previewImportScenarioFromFile({
        includeProfiles: effectiveIncludeProfiles,
        includePosts,
        includeReposts,
        includeSheets,
      });

      if (!res?.ok) {
        setPreview(null);
        Alert.alert("Import preview failed", res?.error ?? "Could not preview import.");
        return;
      }

      const p = res.preview;
      setPreview({
        fileName: res.fileName,
        jsonBytes: res.jsonBytes,
        importedProfiles: p.importedProfiles,
        importedPosts: p.importedPosts,
        importedSheets: p.importedSheets,
      });
    } finally {
      setBusy(false);
    }
  }, [app, busy, effectiveIncludeProfiles, includePosts, includeReposts, includeSheets]);

  const doImport = useCallback(async () => {
    if (busy) return;
    if (!preview) {
      Alert.alert("Pick a file", "Choose an export file first.");
      return;
    }

    setBusy(true);
    try {
      const res = await app.importScenarioFromFile({
        includeProfiles: effectiveIncludeProfiles,
        includePosts,
        includeReposts,
        includeSheets,
      });

      if (!res?.ok) {
        Alert.alert("Import failed", res?.error ?? "Could not import.");
        return;
      }

      Alert.alert(
        "Imported!",
        `scenario created: ${res.scenarioId}\nprofiles: ${res.importedProfiles}\nposts: ${res.importedPosts}\nsheets: ${res.importedSheets ?? 0}`
      );

      router.replace({
        pathname: "/(scenario)/[scenarioId]/(tabs)/home",
        params: { scenarioId: String(res.scenarioId) },
      } as any);
    } finally {
      setBusy(false);
    }
  }, [app, busy, preview, effectiveIncludeProfiles, includePosts, includeReposts, includeSheets]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: colors.text }]}>Import</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <CheckboxRow label="Profiles" checked={effectiveIncludeProfiles} onToggle={toggleProfiles} color={colors.tint} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CheckboxRow
            label="Posts"
            checked={includePosts}
            onToggle={togglePosts}
            color={colors.tint}
            disabled={!effectiveIncludeProfiles && includePosts}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CheckboxRow label="Sheets" checked={includeSheets} onToggle={toggleSheets} color={colors.tint} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={{ color: colors.text, fontWeight: "800" }}>Preview</ThemedText>
          <ThemedText style={{ color: colors.textSecondary, marginTop: 6 }}>
            {preview
              ? `file: ${preview.fileName ?? "(unknown)"}\nsize: ${preview.jsonBytes} bytes\nprofiles: ${preview.importedProfiles}\nposts: ${preview.importedPosts}\nsheets: ${preview.importedSheets}`
              : "Pick a file to preview what will be imported."}
          </ThemedText>
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
            onPress={pickAndPreview}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.8 },
              busy && { opacity: 0.6 },
            ]}
          >
            <ThemedText style={{ color: colors.text, fontWeight: "800" }}>{busy ? "Working…" : "Choose file…"}</ThemedText>
          </Pressable>

          <Pressable
            onPress={doImport}
            disabled={busy || !preview}
            style={({ pressed }) => [
              styles.btn,
              styles.primaryBtn,
              { backgroundColor: colors.text },
              pressed && { opacity: 0.85 },
              (busy || !preview) && { opacity: 0.6 },
            ]}
          >
            <ThemedText style={{ color: colors.background, fontWeight: "900" }}>{busy ? "Importing…" : "Import"}</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 18, gap: 14 },

  header: { gap: 6 },
  title: { fontSize: 22, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 18 },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 16, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },

  actions: { marginTop: "auto", flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  primaryBtn: { borderWidth: 0 },
});
