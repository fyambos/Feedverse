import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { clearDraft, type DraftKind, listDrafts, type DraftListItem } from "@/lib/drafts";

type Params = {
  kind?: DraftKind | "all";
};

function rowTitle(item: DraftListItem) {
  if (item.kind === "post") return "Post";
  if (item.kind === "message") return "Message";
  return "Draft";
}

export default function DraftsModal() {
  const { kind } = useLocalSearchParams<Params>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const filterKind: DraftKind | undefined = useMemo(() => {
    const k = String(kind ?? "").trim();
    if (k === "post" || k === "message") return k;
    return undefined;
  }, [kind]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DraftListItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listDrafts({ kind: filterKind });
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterKind]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load])
  );

  const onPressRow = useCallback((item: DraftListItem) => {
    if (item.kind === "post") {
      const sid = String(item.parts?.scenarioId ?? item.value?.scenarioId ?? "").trim();
      if (!sid) return;
      router.push({
        pathname: "/modal/create-post",
        params: { scenarioId: sid, draftKey: item.key },
      } as any);
      return;
    }

    if (item.kind === "message") {
      const sid = String(item.parts?.scenarioId ?? item.value?.scenarioId ?? "").trim();
      const cid = String(item.parts?.conversationId ?? item.value?.conversationId ?? "").trim();
      if (!sid || !cid) return;
      router.push({
        pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
        params: { scenarioId: sid, conversationId: cid, draftKey: item.key },
      } as any);
      return;
    }
  }, []);

  const onDeleteRow = useCallback(
    (item: DraftListItem) => {
      Alert.alert("Delete draft?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await clearDraft(item.key);
              void load();
            } catch {
              // ignore
            }
          },
        },
      ]);
    },
    [load]
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <ThemedText style={{ color: colors.text, fontSize: 16 }}>Close</ThemedText>
          </Pressable>
          <ThemedText style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Drafts</ThemedText>
          <View style={{ width: 52 }} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={{ color: colors.text, opacity: 0.7 }}>No drafts</ThemedText>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.key}
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
            renderItem={({ item }) => {
              const preview = String(item.preview ?? "").trim();
              return (
                <Pressable
                  onPress={() => onPressRow(item)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: colors.text, fontWeight: "800" }}>{rowTitle(item)}</ThemedText>
                    {preview ? (
                      <ThemedText numberOfLines={2} style={{ color: colors.text, marginTop: 6 }}>
                        {preview}
                      </ThemedText>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={() => onDeleteRow(item)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>Delete</ThemedText>
                  </Pressable>
                </Pressable>
              );
            }}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 10,
    gap: 10,
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
