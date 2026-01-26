// mobile/app/modal/reaction-list.tsx

import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/context/dialog";
import { useAppData } from "@/context/appData";
import type { Profile } from "@/data/db/schema";
import { formatErrorMessage } from "@/lib/utils/format";

type Params = {
  scenarioId: string;
  postId: string;
  kind: "likes" | "reposts";
};

export default function ReactionListModal() {
  const { scenarioId, postId, kind } = useLocalSearchParams<Params>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const poid = decodeURIComponent(String(postId ?? ""));
  const reactionKind: "likes" | "reposts" = kind === "reposts" ? "reposts" : "likes";

  const title = reactionKind === "likes" ? "Likes" : "Reposts";

  const app = useAppData() as any;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Profile[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const fn = reactionKind === "likes" ? app?.listLikersForPost : app?.listRepostersForPost;
        if (typeof fn !== "function") {
          setItems([]);
          return;
        }
        const res: Profile[] = await fn(String(sid), String(poid));
        if (cancelled) return;
        setItems(Array.isArray(res) ? res : []);
      } catch (e: unknown) {
        if (!cancelled) {
          setItems([]);
          Alert.alert("Could not load", formatErrorMessage(e, "Please try again."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sid, poid, reactionKind]);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    if (!items.length) return reactionKind === "likes" ? "No likes yet." : "No reposts yet.";
    return `${items.length} ${items.length === 1 ? "profile" : "profiles"}`;
  }, [items.length, loading, reactionKind]);

  const openProfile = (profileId: string) => {
    const pid = String(profileId ?? "").trim();
    if (!sid || !pid) return;

    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
      params: { scenarioId: sid, profileId: pid },
    } as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={React.useMemo(() => ({ headerShown: false, presentation: "modal" }), [])} />

        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable
            onPress={() => {
              try {
                router.back();
              } catch {
                router.replace("/" as any);
              }
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.headerBtn}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
              {title}
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>{subtitle}</ThemedText>
          </View>

          <View style={styles.headerBtn} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(p) => String((p as any)?.id ?? Math.random())}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const p = item as any;
            const pid = String(p?.id ?? "");
            const name = String(p?.displayName ?? "").trim() || "Unknown";
            const handle = String(p?.handle ?? "").trim();

            return (
              <Pressable
                onPress={() => openProfile(pid)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
                ]}
              >
                <Avatar uri={String(p?.avatarUrl ?? "") || undefined} size={44} fallbackColor={colors.border} />
                <View style={styles.rowText}>
                  <ThemedText type="defaultSemiBold" style={{ color: colors.text }} numberOfLines={1}>
                    {name}
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary }} numberOfLines={1}>
                    {handle ? `@${handle}` : ""}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <ThemedText style={{ color: colors.textSecondary }}>{subtitle}</ThemedText>
              </View>
            ) : null
          }
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  listContent: { paddingBottom: 24 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },

  empty: { padding: 24, alignItems: "center" },
});
