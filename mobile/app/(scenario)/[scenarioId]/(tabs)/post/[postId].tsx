// mobile/app/(scenario)/[scenarioId]/(tabs)/post/[postId].tsx

import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";

import { SwipeableRow } from "@/components/ui/SwipeableRow";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import type { Post } from "@/data/db/schema";

import { canEditPost } from "@/lib/permission";

export default function PostScreen() {
  const { scenarioId, postId, from } = useLocalSearchParams<{
    scenarioId: string;
    postId: string;
    from?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const pid = String(postId ?? "");

  // If opened from a deep link / notification, there might be no back stack.
  const fromPath =
    typeof from === "string" && from.length > 0
      ? from
      : `/(scenario)/${encodeURIComponent(sid)}/(tabs)`;

  const { userId } = useAuth();
  const {
    isReady,
    getPostById,
    getProfileById,
    listRepliesForPost,
    deletePost,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,
  } = useAppData();

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

  const root = isReady ? getPostById(pid) : null;
  const isDeletedRoot = isReady && !root;

  const isMissingParent =
    isReady && !!root?.parentPostId && !getPostById(String(root.parentPostId));
  const showDeletedPlaceholder = isDeletedRoot || isMissingParent;

  const thread = useMemo(() => {
    if (!isReady) return null;

    const result: Post[] = [];
    if (root) result.push(root);

    const walk = (parentId: string) => {
      const children = [...listRepliesForPost(parentId)].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt))
      );

      for (const child of children) {
        result.push(child);
        walk(String(child.id));
      }
    };

    walk(pid);
    return result;
  }, [isReady, root, pid, listRepliesForPost]);

  const onBack = useCallback(() => {
    // ✅ This preserves swipe-back chain:
    // Post -> Profile -> Feed
    if ((router as any)?.canGoBack?.()) {
      router.back();
      return;
    }

    // Fallback for deep links (no back stack)
    router.replace(fromPath as any);
  }, [fromPath]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Post",
          headerTitleAlign: "center",
          headerLeft: () => (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {!isReady ? (
        <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Loading…</ThemedText>
        </ThemedView>
      ) : !thread ? (
        <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Post not found.</ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={thread}
          keyExtractor={(i) => String(i.id)}
          ListHeaderComponent={
            showDeletedPlaceholder ? (
              <View style={[styles.deletedWrap, { borderColor: colors.border }]}>
                <ThemedText style={{ color: colors.text, fontWeight: "700" }}>Deleted post</ThemedText>
                <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                  This post is no longer available.
                </ThemedText>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const itemId = String(item.id);

            const authorProfileId = item.authorProfileId ? String(item.authorProfileId) : "";
            const profile = authorProfileId ? getProfileById(authorProfileId) : null;
            if (!profile) return null;

            const parent = item.parentPostId ? getPostById(String(item.parentPostId)) : null;
            const parentProfile = parent?.authorProfileId
              ? getProfileById(String(parent.authorProfileId))
              : null;

            const isRoot = itemId === pid;
            const focusedIsReply = isRoot && !!item.parentPostId;
            const variant = isRoot && !focusedIsReply ? "detail" : "reply";

            const canEdit = canEditPost({ authorProfile: profile, userId });

            const next = thread[index + 1];
            const showThreadLine = !!next && String(next.parentPostId ?? "") === String(item.id);

            const liked = isPostLikedBySelectedProfile(sid, itemId);
            const reposted = isPostRepostedBySelectedProfile(sid, itemId);

            const content = (
              <PostCard
                scenarioId={sid}
                profile={profile as any}
                item={item as any}
                variant={variant}
                replyingTo={parentProfile?.handle}
                showActions
                showThreadLine={showThreadLine}
                isLiked={liked}
                onLike={() => toggleLike(sid, itemId)}
                isReposted={reposted}
                onRepost={() => toggleRepost(sid, itemId)}
              />
            );

            return (
              <SwipeableRow
                enabled={canEdit}
                colors={colors}
                rightThreshold={24}
                onEdit={() => openEditPost(itemId)}
                onDelete={() => onDeletePost(itemId)}
              >
                {content}
              </SwipeableRow>
            );
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  deletedWrap: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    opacity: 0.9,
  },
});