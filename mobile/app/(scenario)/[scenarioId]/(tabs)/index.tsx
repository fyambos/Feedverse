import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, Pressable, Animated as RNAnimated, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";
import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { canEditPost } from "@/lib/permission";

type Cursor = string | null;

const PAGE_SIZE = 12;

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? "");

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const { isReady, listPostsPage, getProfileById, deletePost, toggleLike, isPostLikedBySelectedProfile } = useAppData();

  /* -------------------------------------------------------------------------- */
  /* Paging state                                                               */
  /* -------------------------------------------------------------------------- */

  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadingLock = useRef(false);

  const loadFirstPage = useCallback(() => {
    if (!isReady) return;
    const page = listPostsPage({ scenarioId: sid, limit: PAGE_SIZE, cursor: null });

    setItems(page.items);
    setCursor(page.nextCursor);
    setHasMore(!!page.nextCursor);
    setInitialLoading(false);
  }, [isReady, listPostsPage, sid]);

  const loadMore = useCallback(() => {
    if (!isReady) return;
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
  }, [isReady, hasMore, listPostsPage, sid, cursor]);

  // reset when scenario changes / db becomes ready
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);

    if (isReady) loadFirstPage();
  }, [sid, isReady, loadFirstPage]);

  /* -------------------------------------------------------------------------- */
  /* FAB animation                                                               */
  /* -------------------------------------------------------------------------- */

  const scale = React.useRef(new RNAnimated.Value(1)).current;
  const navLock = React.useRef(false);

  const pressIn = () => {
    if (navLock.current) return;
    RNAnimated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    RNAnimated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  /* -------------------------------------------------------------------------- */
  /* Navigation                                                                  */
  /* -------------------------------------------------------------------------- */

  const openCreatePost = () => {
    if (navLock.current) return;
    navLock.current = true;

    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid },
    } as any);

    setTimeout(() => {
      navLock.current = false;
    }, 450);
  };

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
      router.push(`/(scenario)/${sid}/(tabs)/post/${postId}` as any);
    },
    [sid]
  );

  const onDeletePost = useCallback(
    async (postId: string) => {
      await deletePost(postId);
      // simple refresh: reload first page so UI stays consistent
      loadFirstPage();
    },
    [deletePost, loadFirstPage]
  );

  /* -------------------------------------------------------------------------- */
  /* Render                                                                      */
  /* -------------------------------------------------------------------------- */

  const data = useMemo(() => items, [items]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
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
          const liked = isPostLikedBySelectedProfile(sid, String(item.id));

          const content = (
            <Pressable onPress={() => openPostDetail(String(item.id))}>
              <PostCard
                scenarioId={sid}
                profile={profile as any}
                item={item as any}
                variant="feed"
                showActions
                isLiked={liked}
                onLike={() => toggleLike(sid, String(item.id))}
              />
            </Pressable>
          );

          return (
            <SwipeableRow
              enabled={canEdit}
              colors={colors}
              rightThreshold={24}
              onEdit={() => openEditPost(String(item.id))}
              onDelete={() => onDeletePost(String(item.id))}
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

      {/* FAB */}
      <RNAnimated.View style={[styles.fab, { backgroundColor: colors.tint, transform: [{ scale }] }]}>
        <Pressable
          onPress={openCreatePost}
          onPressIn={pressIn}
          onPressOut={pressOut}
          hitSlop={16}
          style={styles.fabPress}
          disabled={navLock.current}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </Pressable>
      </RNAnimated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPress: { flex: 1, alignItems: "center", justifyContent: "center" },
});
