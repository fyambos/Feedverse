import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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

type Cursor = string | null;
const PAGE_SIZE = 12;

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? "");



  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const {
    isReady,
    listPostsPage,
    getProfileById,
    deletePost,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,
  } = useAppData();

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

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);

    if (isReady) loadFirstPage();
  }, [sid, isReady, loadFirstPage]);

  const navLock = React.useRef(false);

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
      if (!sid) return;

      router.push({
        pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
        params: {
          scenarioId: sid,
          postId: String(postId),

          // fallback if no back stack
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
  list: { paddingVertical: 8 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
});