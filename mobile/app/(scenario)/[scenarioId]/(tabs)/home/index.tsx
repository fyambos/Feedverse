import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, Pressable, ActivityIndicator, Image, RefreshControl, Animated } from "react-native";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MemoPost as PostCard } from "@/components/post/Post";
import { CreatePostFab } from "@/components/post/CreatePostFab";
import { useAuth } from "@/context/auth";
import { consumeScenarioFeedRefreshNeeded, useAppData } from "@/context/appData";
import { useFocusEffect } from "@react-navigation/native";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { canEditPost } from "@/lib/access/permission";
import { Avatar } from "@/components/ui/Avatar";
import { Alert, useDialog } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/utils/format";
import { scenarioIdFromPathname } from "@/lib/utils/idFromPathName";

type Cursor = string | null;
const PAGE_SIZE = 12;

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const pathname = usePathname();

  const sid = useMemo(() => {
    const fromParams = typeof scenarioId === "string" ? scenarioId.trim() : "";
    if (fromParams) return fromParams;
    return scenarioIdFromPathname(pathname);
  }, [scenarioId, pathname]);

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const auth = useAuth();
  const { userId } = auth;
  const app = useAppData() as any;
  const { dialog } = useDialog();

  const {
    isReady,
    db,

    listPostsPage,
    refreshPostsForScenario,
    getProfileById,
    getPostById,
    deletePost,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,

    getSelectedProfileId,

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

  const exportThisScenario = useCallback(() => {
    if (!sid) return;
    router.push({
      pathname: "/modal/export-scenario",
      params: { scenarioId: sid },
    } as any);
  }, [sid]);

  const openScenarioMenu = useCallback(() => {
    const profileId = selectedProfile?.id ? String(selectedProfile.id) : null;

    // detect scenario mode (campaign vs story)
    const scenario =
      typeof app.getScenarioById === "function"
        ? app.getScenarioById(sid)
        : app.scenarios?.[sid] ?? app.scenarioById?.[sid] ?? null;

    const isCampaign = String((scenario as any)?.mode ?? "story") === "campaign";

    const actions: Array<{ text: string; variant?: "default" | "cancel" | "destructive"; onPress: () => void; icon?: any }> = [
      {
        text: "Profile",
        icon: { name: "person-circle-outline" as const },
        onPress: () => {
          if (!profileId) {
            router.push({
              pathname: "/modal/select-profile",
              params: { scenarioId: sid },
            } as any);
            return;
          }
          router.push({
            pathname: "/(scenario)/[scenarioId]/home/profile/[profileId]",
            params: { scenarioId: sid, profileId },
          } as any);
        },
      },
    ];

    actions.push({
      text: "Players",
      icon: { name: "people-outline" as const },
      onPress: () => {
        router.push({
          pathname: "/(scenario)/[scenarioId]/players",
          params: { scenarioId: sid },
        } as any);
      },
    });

    // Add "View pins" only in campaign mode, before View Settings
    if (isCampaign) {
      actions.push({
        text: "View pins",
        icon: { name: "pin-outline" as const },
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
        icon: { name: "settings-outline" as const },
        onPress: () => {
          router.push({
            pathname: "/modal/create-scenario",
            params: { scenarioId: sid },
          } as any);
        },
      },
      {
        text: "Notification settings",
        icon: { name: "notifications-outline" as const },
        onPress: () => {
          router.push(`/(scenario)/${sid}/notifications-settings` as any);
        },
      },
      {
        text: "Mute all notifications",
        variant: "destructive",
        icon: { name: "notifications-off-outline" as const },
        onPress: async () => {
          try {
            await app?.updateScenarioNotificationPrefs?.(sid, { muteAll: true });
            Alert.alert("Muted", "All notifications for this scenario are now off.");
          } catch (e: any) {
            Alert.alert("Mute failed", formatErrorMessage(e, "Could not mute notifications"));
          }
        },
      },
      { text: "Export…", icon: { name: "download-outline" as const }, onPress: exportThisScenario },
      {
        text: "Back to home",
        icon: { name: "home-outline" as const },
        onPress: () => {
          try {
            router.dismissAll();
          } catch {}
          router.replace("/" as any);
        },
      },
      { text: "Cancel", variant: "cancel", onPress: () => undefined }
    );

    // Use the app's custom dialog modal instead of the native RN Alert.
    dialog({
      title: "Scenario menu",
      message: "",
      buttons: actions.map((a) => ({
        text: a.text,
        variant: a.variant ?? "default",
        icon: a.icon,
        onPress: () => {
          // Support async handlers without blocking UI.
          try {
            const res = a.onPress?.();
            void res;
          } catch {}
        },
      })),
    }).catch(() => void 0);
  }, [app, dialog, exportThisScenario, selectedProfile?.id, sid]);

  // ===== FEED =====
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState<number>(() => Date.now());

  const backendMode = useMemo(() => {
    const token = String((auth as any)?.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    return Boolean(token && baseUrl);
  }, [auth]);

  const loadingLock = useRef(false);
  const listRef = useRef<FlatList<any> | null>(null);
  const deletePostRef = useRef(false);
  const initialRetryRef = useRef<{ interval: any; timeout: any } | null>(null);

  const SkeletonFeed = useMemo(() => {
    const block = (w: number | string, h: number, r = 10, extra?: any) => (
      <View
        style={[
          {
            width: w,
            height: h,
            borderRadius: r,
            backgroundColor: colors.border,
            opacity: 0.5,
          },
          extra,
        ]}
      />
    );

    const dot = (size: number, extra?: any) => (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.border,
            opacity: 0.5,
          },
          extra,
        ]}
      />
    );

    const Row = ({ i }: { i: number }) => {
      const showMedia = i % 3 === 1;

      return (
        <View key={`sk_${i}`}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ width: 44, alignItems: "center" }}>
                {dot(44)}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {block("40%", 14, 8)}
                  {block("30%", 14, 8)}
                </View>

                {block("92%", 12, 8, { marginTop: 10 })}
                {block("80%", 12, 8, { marginTop: 8 })}
                {block("62%", 12, 8, { marginTop: 8 })}

                {showMedia ? block("92%", 170, 16, { marginTop: 12 }) : null}

                <View style={{ flexDirection: "row", marginTop: 12, gap: 28 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {dot(18)}
                    {block(18, 10, 6)}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {dot(18)}
                    {block(18, 10, 6)}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {dot(18)}
                    {block(18, 10, 6)}
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        </View>
      );
    };

    return (
      <View style={{ paddingTop: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Row key={`skrow_${i}`} i={i} />
        ))}
      </View>
    );
  }, [colors.border]);

  const avatarScale = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback((v: Animated.Value) => {
    Animated.spring(v, {
      toValue: 0.92,
      speed: 30,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, []);

  const pressOut = useCallback((v: Animated.Value) => {
    Animated.spring(v, {
      toValue: 1,
      speed: 20,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadFirstPage = useCallback(() => {
    if (!isReady) return;
    if (!sid) return;
    if (backendMode && !auth.isReady) return;

    const page = listPostsPage({ scenarioId: sid, limit: PAGE_SIZE, cursor: null });
    setItems(page.items);
    setCursor(page.nextCursor);
    setHasMore(!!page.nextCursor);

    // In backend mode, the first render can happen before the async sync fills
    // the DB. Keep the skeleton until we either get items or we give up.
    if (!backendMode || page.items.length > 0) {
      setInitialLoading(false);
    }
  }, [auth.isReady, backendMode, isReady, listPostsPage, sid]);

  // Background sync updates AppData often, which changes function identities.
  // Keep a ref to the latest loader so our "reset feed" effect only runs when
  // scenarioId/isReady changes (not on every sync tick).
  const loadFirstPageRef = useRef(loadFirstPage);
  useEffect(() => {
    loadFirstPageRef.current = loadFirstPage;
  }, [loadFirstPage]);

  const onRefresh = useCallback(() => {
    if (!isReady) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setRefreshing(true);

    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });

      // Force posts sync (including replies) in backend mode.
      // This bypasses the normal throttle.
      try {
        refreshPostsForScenario?.(sid);
      } catch {}

      loadFirstPage();

      // The forced sync is async; reload shortly after so new replies show up.
      setTimeout(() => {
        try {
          loadFirstPageRef.current();
        } catch {}
      }, 450);

      // bump a tick so FlatList re-renders items (updates relative timestamps)
      setRefreshTick(Date.now());
      // shallow-clone current items to ensure rows receive new object references
      setItems((prev) => prev.map((it) => ({ ...(it as any) })));
    } finally {
      setRefreshing(false);
      loadingLock.current = false;
    }
  }, [isReady, loadFirstPage, refreshPostsForScenario, sid]);

  // Ensure the feed loads on first focus (some backend sync paths can populate
  // the DB after the initial render). Also refresh when a post/delete flagged it.
  useFocusEffect(
    useCallback(() => {
      if (!isReady) return;
      if (!sid) return;
      if (backendMode && !auth.isReady) return;

      // If we have no items yet, trigger a load so we don't wait until you
      // leave/re-enter the tab.
      if (items.length === 0) {
        loadFirstPageRef.current();
      }

      if (consumeScenarioFeedRefreshNeeded(sid)) {
        onRefresh();
      }
    }, [auth.isReady, backendMode, isReady, onRefresh, sid, items.length]),
  );

  const loadMore = useCallback(() => {
    if (!isReady) return;
    if (refreshing) return;
    if (!hasMore) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setLoadingMore(true);

    try {
      const page = listPostsPage({ scenarioId: sid, limit: PAGE_SIZE, cursor });
      setItems((prev) => {
        const seen = new Set(prev.map((it: any) => String((it as any)?.id ?? "")));
        const nextItems = page.items.filter((it: any) => !seen.has(String((it as any)?.id ?? "")));
        return [...prev, ...nextItems];
      });
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor && page.nextCursor !== cursor));
    } finally {
      setLoadingMore(false);
      loadingLock.current = false;
    }
  }, [cursor, hasMore, isReady, listPostsPage, refreshing, sid]);

  // NOTE: db.posts is mutated in-place during sync, so memoizing on `db` can
  // get stuck and never notice new posts. Compute per-render instead.
  const hasAnyRootPostInDbForScenario = (() => {
    if (!db || !sid) return false;
    const posts = ((db as any)?.posts ?? {}) as Record<string, any>;
    for (const p of Object.values(posts)) {
      if (String((p as any)?.scenarioId ?? "") !== sid) continue;
      if ((p as any)?.parentPostId) continue;
      return true;
    }
    return false;
  })();

  // Reset list only when scenario changes.
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    initialRetryRef.current = null;
  }, [sid]);

  // Trigger initial load when ready (and when auth becomes ready in backend mode)
  // without clearing items again.
  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;
    if (backendMode && !auth.isReady) return;
    loadFirstPageRef.current();
  }, [isReady, sid, backendMode, auth.isReady]);

  // Backend mode: poll briefly so posts appear without re-entering, but ALWAYS
  // stop loading quickly so we never get stuck on skeleton forever.
  useEffect(() => {
    if (!backendMode) return;
    if (!isReady) return;
    if (!auth.isReady) return;
    if (!sid) return;
    if (!initialLoading) return;
    if (items.length > 0) return;

    if (!initialRetryRef.current) initialRetryRef.current = { interval: null, timeout: null };
    const state = initialRetryRef.current;

    if (state.interval || state.timeout) return;

    const maxAttempts = 6; // 6 * 500ms = 3s
    let attempts = 0;

    state.interval = setInterval(() => {
      attempts += 1;
      loadFirstPageRef.current();

      if (attempts >= maxAttempts) {
        try {
          if (state.interval) clearInterval(state.interval);
        } catch {}
        state.interval = null;
      }
    }, 500);

    // Hard cutoff for the skeleton (fast). Empty scenarios should show empty state.
    state.timeout = setTimeout(() => {
      state.timeout = null;
      try {
        if (state.interval) clearInterval(state.interval);
      } catch {}
      state.interval = null;
      setInitialLoading(false);
    }, 2000);

    return () => {
      try {
        if (state.interval) clearInterval(state.interval);
        if (state.timeout) clearTimeout(state.timeout);
      } catch {}
      state.interval = null;
      state.timeout = null;
    };
  }, [backendMode, isReady, auth.isReady, sid, items.length, initialLoading]);

  // If the screen loaded before posts finished syncing from backend, we can
  // end up with an empty feed until you leave/re-enter. When posts arrive,
  // reload the first page once (only while still empty).
  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;
    if (items.length > 0) return;
    if (!hasAnyRootPostInDbForScenario) return;
    loadFirstPageRef.current();
  }, [hasAnyRootPostInDbForScenario, isReady, sid, items.length]);

  useEffect(() => {
    // If we navigate to a different scenarioId (e.g. after import), reset scroll.
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [sid]);

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
      return new Promise<void>((resolve) => {
        Alert.alert("Delete post?", "This will remove the post.", [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (deletePostRef.current) return resolve();
              deletePostRef.current = true;
              try {
                await deletePost(postId);
                // Remove immediately from current list (avoids waiting for AppData rerender),
                // then re-sync the first page.
                setItems((prev) => prev.filter((p: any) => String(p?.id ?? "") !== String(postId)));
                setTimeout(() => loadFirstPageRef.current(), 0);
              } catch (e: any) {
                Alert.alert("Could not delete", formatErrorMessage(e, "Could not delete post"));
              } finally {
                deletePostRef.current = false;
                resolve();
              }
            },
          },
        ]);
      });
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
            onPress={openScenarioMenu}
            onLongPress={() => {
              const pid = selectedProfile?.id ? String(selectedProfile.id) : null;
              if (!pid) {
                router.push({
                  pathname: "/modal/select-profile",
                  params: { scenarioId: sid },
                } as any);
                return;
              }
              router.push({
                pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
                params: { scenarioId: sid, profileId: pid },
              } as any);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Scenario menu"
            onPressIn={() => pressIn(avatarScale)}
            onPressOut={() => pressOut(avatarScale)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
              <Avatar uri={selectedProfile?.avatarUrl ?? null} size={30} fallbackColor={colors.border} />
            </Animated.View>
          </Pressable>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/modal/select-profile",
                  params: { scenarioId: sid },
                } as any)
              }
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Select profile"
              onPressIn={() => pressIn(logoScale)}
              onPressOut={() => pressOut(logoScale)}
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Animated.View style={{ transform: [{ scale: logoScale }] }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    overflow: "hidden",
                    backgroundColor: colors.border,
                  }}
                >
                  <Image
                    source={require("@/assets/images/FeedverseIcon.png")}
                    style={{ width: 32, height: 32, borderRadius: 16 }}
                    resizeMode="cover"
                  />
                </View>
              </Animated.View>
            </Pressable>
          </View>

          <View style={{ width: 30 }} />
        </View>
      </SafeAreaView>
    );
  }, [
    avatarScale,
    colors.background,
    colors.border,
    logoScale,
    openScenarioMenu,
    pressIn,
    pressOut,
    selectedProfile?.avatarUrl,
    selectedProfile?.id,
    sid,
  ]);

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
        extraData={refreshTick}
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
          const livePost = getPostById(postId) ?? item;
          const liked = isPostLikedBySelectedProfile(sid, postId);
          const reposted = isPostRepostedBySelectedProfile(sid, postId);

          const content = (
            <Pressable onPress={() => openPostDetail(postId)}>
              <PostCard
                scenarioId={sid}
                profile={profile as any}
                item={livePost as any}
                refreshTick={refreshTick}
                variant="feed"
                showActions
                isLiked={liked}
                onLike={() => {
                  void toggleLike(sid, postId).catch((e: unknown) => {
                    Alert.alert("Could not like", formatErrorMessage(e, "Please try again."));
                  });
                }}
                isReposted={reposted}
                onRepost={() => {
                  void toggleRepost(sid, postId).catch((e: unknown) => {
                    Alert.alert("Could not repost", formatErrorMessage(e, "Please try again."));
                  });
                }}
              />
            </Pressable>
          );

          return (
            <SwipeableRow
              key={`${postId}::${refreshTick}`}
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
          const shouldShowSkeleton =
            !isReady ||
            initialLoading ||
            (backendMode && auth.isReady && items.length === 0 && hasAnyRootPostInDbForScenario);

          if (shouldShowSkeleton) return SkeletonFeed;

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