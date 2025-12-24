// mobile/app/(scenario)/[scenarioId]/(tabs)/post/[postId].tsx
import React, { useCallback, useMemo, useRef } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { useLocalSearchParams, router } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import type { Post } from "@/data/db/schema";

export default function PostScreen() {
  const { scenarioId, postId } = useLocalSearchParams<{ scenarioId: string; postId: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const pid = String(postId ?? "");

  const { userId } = useAuth();
  const {
    isReady,
    getPostById,
    getProfileById,
    listRepliesForPost,
    deletePost,
  } = useAppData();

  const swipeRefs = useRef(new Map<string, any>()).current;

  const closeSwipe = useCallback(
    (id: string) => {
      const ref = swipeRefs.get(id);
      if (ref && typeof (ref as any).close === "function") (ref as any).close();
    },
    [swipeRefs]
  );

  const openEditPost = useCallback(
    (id: string) => {
      router.push({
        pathname: "/modal/create-post",
        params: { scenarioId: sid, mode: "edit", postId: String(id) },
      } as any);
    },
    [sid]
  );

  const onDeletePost = useCallback(
    async (id: string) => {
      await deletePost(String(id));
    },
    [deletePost]
  );

  const RightActions = ({ postId, dragX }: { postId: string; dragX: any }) => {
    const ACTIONS_WIDTH = 120;

    const animatedStyle = useAnimatedStyle(() => {
      const translateX = interpolate(
        dragX.value,
        [-ACTIONS_WIDTH, 0],
        [0, ACTIONS_WIDTH],
        Extrapolation.CLAMP
      );
      return { transform: [{ translateX }] };
    });

    const pressedBg = colors.pressed;

    return (
      <Animated.View style={[styles.swipeActions, { width: ACTIONS_WIDTH }, animatedStyle]}>
        <Pressable
          onPress={() => {
            closeSwipe(postId);
            requestAnimationFrame(() => openEditPost(postId));
          }}
          style={({ pressed }) => [
            styles.swipeBtn,
            { backgroundColor: pressed ? pressedBg : "transparent", borderColor: colors.tint },
          ]}
          hitSlop={10}
        >
          <Ionicons name="pencil" size={22} color={colors.tint} />
        </Pressable>

        <Pressable
          onPress={() => {
            closeSwipe(postId);
            void onDeletePost(postId);
          }}
          style={({ pressed }) => [
            styles.swipeBtn,
            { backgroundColor: pressed ? pressedBg : "transparent", borderColor: "#F04438" },
          ]}
          hitSlop={10}
        >
          <Ionicons name="trash-outline" size={22} color="#F04438" />
        </Pressable>
      </Animated.View>
    );
  };

  const renderRightActions = useCallback(
    (postId: string, _progress: any, dragX: any) => <RightActions postId={postId} dragX={dragX} />,
    [closeSwipe, openEditPost, onDeletePost, colors.pressed, colors.tint]
  );

  // --- DB reads
  const root = isReady ? getPostById(pid) : null;

  // build nested thread: root -> replies -> replies-to-replies ...
  const thread = useMemo(() => {
    if (!root) return null;

    const result: Post[] = [root];

    const walk = (parentId: string) => {
      const children = listRepliesForPost(parentId); // sorted oldest -> newest
      for (const child of children) {
        result.push(child);
        walk(String(child.id));
      }
    };

    walk(String(root.id));
    return result;
  }, [root, listRepliesForPost]);

  if (!isReady) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!root || !thread) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Post not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={thread}
        keyExtractor={(i) => String(i.id)}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => {
          const itemId = String(item.id);

          const authorProfileId = item.authorProfileId ? String(item.authorProfileId) : "";
          const profile = authorProfileId ? getProfileById(authorProfileId) : null;
          if (!profile) return null;

          const parent = item.parentPostId ? getPostById(String(item.parentPostId)) : null;
          const parentProfile =
            parent?.authorProfileId ? getProfileById(String(parent.authorProfileId)) : null;

          const isRoot = itemId === String(root.id);
          const variant = isRoot ? "detail" : "reply";

          const canEdit = profile.ownerUserId === userId || !!profile.isPublic;

          const content = (
            <PostCard
              scenarioId={sid}
              profile={profile as any}
              item={item as any}
              variant={variant}
              replyingTo={parentProfile?.handle}
              showActions
            />
          );

          if (!canEdit) return content;

          let swipeRef = swipeRefs.get(itemId);
          if (!swipeRef) {
            swipeRef = { current: null };
            swipeRefs.set(itemId, swipeRef);
          }

          return (
            <ReanimatedSwipeable
              ref={swipeRef as any}
              overshootRight={false}
              friction={2}
              rightThreshold={24}
              renderRightActions={(progress, dragX) => renderRightActions(itemId, progress, dragX)}
            >
              {content}
            </ReanimatedSwipeable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sep: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
  swipeActions: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 12,
    gap: 10,
  },
  swipeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
