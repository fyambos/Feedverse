// mobile/app/(scenario)/pins.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

import { Avatar } from "@/components/ui/Avatar";
import { Post as PostCard } from "@/components/post/Post";

import { Alert } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/format";

type PinRow = {
  id: string; // postId
};

export default function PinsScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? "");

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId, currentUser } = useAuth();
  const currentUserId: string | null = (userId ?? currentUser?.id ?? null) as any;

  const app = useAppData() as any;
  const {
    isReady,
    getScenarioById,

    getPostById,
    getProfileById,
    getSelectedProfileId,

    listPinnedPostsForScenario,
    reorderPinnedPostsForScenario,
  } = app;

  const selectedProfileId = useMemo(() => {
    try {
      return sid ? (getSelectedProfileId?.(sid) ?? null) : null;
    } catch {
      return null;
    }
  }, [getSelectedProfileId, sid]);

  const selectedProfile = useMemo(() => {
    const pid = selectedProfileId ? String(selectedProfileId) : "";
    return pid ? getProfileById?.(pid) ?? null : null;
  }, [getProfileById, selectedProfileId]);

  const scenario = useMemo(() => {
    try {
      return sid && typeof getScenarioById === "function" ? getScenarioById(sid) : null;
    } catch {
      return null;
    }
  }, [getScenarioById, sid]);

  const isGmUser = Boolean(
    currentUserId &&
      scenario &&
      (scenario.ownerUserId === currentUserId ||
        (Array.isArray(scenario.gmUserIds) && scenario.gmUserIds.includes(currentUserId)))
  );

  const canEditPins = Boolean(isGmUser);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const saveLock = useRef(false);
  const lastSavedRef = useRef<string>("");

  const pinnedPosts = useMemo(() => {
    if (!isReady || !sid) return [];
    try {
      return listPinnedPostsForScenario?.(sid) ?? [];
    } catch {
      return [];
    }
  }, [isReady, listPinnedPostsForScenario, sid]);

  // initial load / refresh when pins change
  useEffect(() => {
    const ids = pinnedPosts.map((p: any) => String(p.id));
    setOrderedIds(ids);
    lastSavedRef.current = ids.join("|");
  }, [pinnedPosts]);

  const persistOrder = useCallback(
    async (nextOrder: string[]) => {
      if (!canEditPins) return;
      if (!sid) return;

      const sig = nextOrder.join("|");
      if (sig === lastSavedRef.current) return;

      if (saveLock.current) return;
      saveLock.current = true;
      setSaving(true);

      try {
        await reorderPinnedPostsForScenario(sid, nextOrder);
        lastSavedRef.current = sig;
      } catch (e: any) {
        Alert.alert("Failed to reorder pins", formatErrorMessage(e, "Could not save new pin order."));
      } finally {
        setSaving(false);
        saveLock.current = false;
      }
    },
    [canEditPins, reorderPinnedPostsForScenario, sid]
  );

  const Header = useMemo(() => {
    return (
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View style={[styles.topbar, { borderBottomColor: colors.border }]}>
          {/* Left: avatar -> select profile */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/modal/select-profile",
                params: { scenarioId: sid },
              } as any)
            }
            hitSlop={12}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Avatar uri={selectedProfile?.avatarUrl ?? null} size={30} fallbackColor={colors.border} />
          </Pressable>

          {/* Center title */}
          <View style={{ flex: 1, alignItems: "center" }}>
            <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>Pinned</ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
              {saving ? "saving…" : canEditPins ? "hold + drag to reorder" : ""}
            </ThemedText>
          </View>

          {/* Right: done */}
          <Pressable
            onPress={async () => {
              await persistOrder(orderedIds);
              router.back();
            }}
            hitSlop={12}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>Done</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }, [
    canEditPins,
    colors.background,
    colors.border,
    colors.text,
    colors.textSecondary,
    colors.tint,
    orderedIds,
    persistOrder,
    saving,
    selectedProfile?.avatarUrl,
    sid,
  ]);

  const data: PinRow[] = useMemo(() => orderedIds.map((id) => ({ id })), [orderedIds]);

  const empty = !isReady ? "loading…" : pinnedPosts.length === 0 ? "No pinned posts yet." : "—";

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<PinRow>) => {
      const post =
        getPostById?.(String(item.id)) ?? pinnedPosts.find((p: any) => String(p.id) === String(item.id));
      if (!post) return null;

      const author = getProfileById?.(String(post.authorProfileId));
      if (!author) return null;

      const index = getIndex?.() ?? 0;
      const rank = index + 1;

      return (
        <View
          style={[
            styles.rowWrap,
            {
              opacity: isActive ? 0.92 : 1,
              backgroundColor: isActive ? colors.card : "transparent",
              borderColor: colors.border,
            },
          ]}
        >
          {/* top row: drag handle (gm only) + rank */}
          <View style={styles.rowTop}>
            {canEditPins ? (
              <Pressable
                onLongPress={drag}
                delayLongPress={120}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.handle,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : "transparent",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reorder pin"
              >
                <Ionicons name="reorder-three" size={18} color={colors.text} />
              </Pressable>
            ) : null}

            <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>#{rank}</ThemedText>

            <View style={{ flex: 1 }} />
          </View>

          {/* post preview */}
          <Pressable
            onPress={() => {
              router.push({
                pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
                params: {
                  scenarioId: sid,
                  postId: String(post.id),
                  from: "/(scenario)/[scenarioId]/pins",
                },
              } as any);
            }}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            <PostCard
              scenarioId={sid}
              profile={author as any}
              item={post as any}
              variant="feed"
              showActions={false}
              showMenu={false}
              isInteractive={false}
              showQuoted
            />
          </Pressable>
        </View>
      );
    },
    [canEditPins, colors.border, colors.card, colors.pressed, colors.text, colors.textSecondary, getPostById, getProfileById, pinnedPosts, sid]
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <DraggableFlatList
        data={data}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={renderItem}
        activationDistance={canEditPins ? 12 : 9999} // prevents accidental drag
        dragItemOverflow
        onDragEnd={({ data: next }) => {
          const nextIds = next.map((x) => String(x.id));
          setOrderedIds(nextIds);
          void persistOrder(nextIds);
        }}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>{empty}</ThemedText>

            {canEditPins && pinnedPosts.length === 0 ? (
              <ThemedText style={{ color: colors.textSecondary, marginTop: 8 }}>
                Pin posts from the feed using the post menu.
              </ThemedText>
            ) : null}
          </View>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingBottom: 16 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },

  topbar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  rowWrap: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    marginHorizontal: 10,
    marginVertical: 8,
  },

  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
  },

  handle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
});