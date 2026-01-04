import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, Pressable, ActivityIndicator, Image, RefreshControl } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";
import { CreatePostFab } from "@/components/post/CreatePostFab";
import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { canEditPost } from "@/lib/permission";
import { Avatar } from "@/components/ui/Avatar";
import { createScenarioIO } from "@/lib/scenarioIO";
import { Alert } from "@/context/dialog";

type Cursor = string | null;
const PAGE_SIZE = 12;

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? "");

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const app = useAppData() as any;

  const {
    isReady,
    db,

    listPostsPage,
    getProfileById,
    deletePost,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,

    getSelectedProfileId,

    previewImportScenarioFromFile,
    importScenarioFromFile,
    exportScenarioToFile,
  } = app;

  const selectedProfileId = useMemo(() => {
    try {
      return getSelectedProfileId?.(sid) ?? null;
    } catch {
      return null;
    }
  }, [getSelectedProfileId, sid]);

  const selectedProfile = useMemo(() => {
    const pid = selectedProfileId ? String(selectedProfileId) : "";
    return pid ? getProfileById?.(pid) ?? null : null;
  }, [getProfileById, selectedProfileId]);

  const io = useMemo(() => {
    return createScenarioIO({
      isReady,
      userId,
      db,
      previewImportScenarioFromFile,
      importScenarioFromFile,
      exportScenarioToFile,
      onImportedNavigate: (newScenarioId: string) => {
        router.replace({
          pathname: "/(scenario)/[scenarioId]",
          params: { scenarioId: newScenarioId },
        } as any);
      },
    });
  }, [isReady, userId, db, previewImportScenarioFromFile, importScenarioFromFile, exportScenarioToFile]);

  const exportThisScenario = useCallback(() => {
    if (!sid) return;
    io.openExportChoice?.(sid);
  }, [io, sid]);

  const openScenarioMenu = useCallback(() => {
    const profileId = selectedProfile?.id ? String(selectedProfile.id) : null;

    // detect scenario mode (campaign vs story)
    const scenario =
      typeof app.getScenarioById === "function"
        ? app.getScenarioById(sid)
        : app.scenarios?.[sid] ?? app.scenarioById?.[sid] ?? null;

    const isCampaign = String((scenario as any)?.mode ?? "story") === "campaign";

    const actions: any[] = [
      {
        text: "Profile",
        onPress: () => {
          if (!profileId) {
            Alert.alert("No profile selected", "Select a profile first.");
            return;
          }
          router.push({
            pathname: "/(scenario)/[scenarioId]/home/profile/[profileId]",
            params: { scenarioId: sid, profileId },
          } as any);
        },
      },
    ];

    // Add "View pins" only in campaign mode, before View Settings
    if (isCampaign) {
      actions.push({
        text: "View pins",
        onPress: () => {
          router.push({
            pathname: "/(scenario)/[scenarioId]/pins",
            params: { scenarioId: sid },
          } as any);
        },
      });
    }

    actions.push(
      {
        text: "View Settings",
        onPress: () => {
          router.push({
            pathname: "/modal/create-scenario",
            params: { scenarioId: sid },
          } as any);
        },
      },
      { text: "Export…", onPress: exportThisScenario },
      {
        text: "Back to home",
        onPress: () => {
          try {
            router.dismissAll();
          } catch {}
          router.replace("/" as any);
        },
      },
      { text: "Cancel", style: "cancel" }
    );

    Alert.alert("Scenario menu", "", actions);
  }, [app, exportThisScenario, selectedProfile?.id, sid]);

  // ===== FEED =====
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadingLock = useRef(false);
  const listRef = useRef<FlatList<any> | null>(null);

  const loadFirstPage = useCallback(() => {
    if (!isReady) return;

    const page = listPostsPage({ scenarioId: sid, limit: PAGE_SIZE, cursor: null });
    setItems(page.items);
    setCursor(page.nextCursor);
    setHasMore(!!page.nextCursor);
    setInitialLoading(false);
  }, [isReady, listPostsPage, sid]);

  const onRefresh = useCallback(() => {
    if (!isReady) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setRefreshing(true);

    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      loadFirstPage();
    } finally {
      setRefreshing(false);
      loadingLock.current = false;
    }
  }, [isReady, loadFirstPage]);

  const loadMore = useCallback(() => {
    if (!isReady) return;
    if (refreshing) return;
    if (!hasMore) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setLoadingMore(true);

    try {
      const page = listPostsPage({ scenarioId: sid, limit: PAGE_SIZE, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } finally {
      setLoadingMore(false);
      loadingLock.current = false;
    }
  }, [isReady, refreshing, hasMore, listPostsPage, sid, cursor]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);

    if (isReady) loadFirstPage();
  }, [sid, isReady, loadFirstPage]);

  const navLock = useRef(false);

  const openCreatePost = useCallback(() => {
    if (navLock.current) return;
    navLock.current = true;

    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid },
    } as any);

    setTimeout(() => {
      navLock.current = false;
    }, 450);
  }, [sid]);

  const openEditPost = useCallback(
    (postId: string) => {
      router.push({
        pathname: "/modal/create-post",
        params: { scenarioId: sid, mode: "edit", postId },
      } as any);
    },
    [sid]
  );

  const openPostDetail = useCallback(
    (postId: string) => {
      if (!sid) return;

      router.push({
        pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
        params: {
          scenarioId: sid,
          postId: String(postId),
          from: "/(scenario)/[scenarioId]/(tabs)/home",
        },
      } as any);
    },
    [sid]
  );

  const onDeletePost = useCallback(
    async (postId: string) => {
      await deletePost(postId);
      loadFirstPage();
    },
    [deletePost, loadFirstPage]
  );

  // remove:
  // const insets = useSafeAreaInsets();
  // const refreshOffset = useMemo(() => insets.top + styles.topbar.height, [insets.top]);

  const TopBar = useMemo(() => {
    return (
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View style={[styles.topbar, { borderBottomColor: colors.border }]}>
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

          <View style={{ flex: 1, alignItems: "center" }}>
            <Pressable
              onPress={openScenarioMenu}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Scenario menu"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Image
                source={require("@/assets/images/FeedverseIcon.png")}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </Pressable>
          </View>

          <View style={{ width: 30 }} />
        </View>
      </SafeAreaView>
    );
  }, [colors.background, colors.border, openScenarioMenu, selectedProfile?.avatarUrl, sid]);

  const data = useMemo(() => items, [items]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {TopBar}

      <FlatList
        ref={(r) => {
          listRef.current = r;
        }}
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary} // iOS
            colors={[colors.tint]} // Android
          />
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!initialLoading) loadMore();
        }}
        ListFooterComponent={() => {
          if (!loadingMore) return <View style={{ height: 24 }} />;
          return (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          );
        }}
        renderItem={({ item }) => {
          const profile = getProfileById(String(item.authorProfileId));
          if (!profile) return null;

          const canEdit = canEditPost({ authorProfile: profile, userId: userId ?? null });

          const postId = String(item.id);
          const liked = isPostLikedBySelectedProfile(sid, postId);
          const reposted = isPostRepostedBySelectedProfile(sid, postId);

          const content = (
            <Pressable onPress={() => openPostDetail(postId)}>
              <PostCard
                scenarioId={sid}
                profile={profile as any}
                item={item as any}
                variant="feed"
                showActions
                isLiked={liked}
                onLike={() => toggleLike(sid, postId)}
                isReposted={reposted}
                onRepost={() => toggleRepost(sid, postId)}
              />
            </Pressable>
          );

          return (
            <SwipeableRow
              enabled={canEdit}
              colors={colors}
              rightThreshold={24}
              onEdit={() => openEditPost(postId)}
              onDelete={() => onDeletePost(postId)}
            >
              {content}
            </SwipeableRow>
          );
        }}
        ListEmptyComponent={() => {
          if (!isReady || initialLoading) {
            return (
              <View style={{ padding: 16 }}>
                <ActivityIndicator />
              </View>
            );
          }

          return (
            <View style={{ padding: 16 }}>
              <Pressable onPress={openCreatePost} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    borderRadius: 16,
                    padding: 14,
                    backgroundColor: colors.card,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="add" size={18} color={colors.tint} />
                    <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                      Create your first post
                    </ThemedText>
                  </View>

                  <ThemedText style={{ color: colors.textSecondary, marginTop: 6 }}>
                    Nothing here yet — post something to start the feed.
                  </ThemedText>
                </View>
              </Pressable>
            </View>
          );
        }}
      />

      <CreatePostFab scenarioId={sid} colors={colors} onPress={openCreatePost} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  list: { paddingBottom: 8 },

  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },

  topbar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});