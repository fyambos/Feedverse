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
  // ✅ added `from?: string`
  const { scenarioId, postId, from } = useLocalSearchParams<{
    scenarioId: string;
    postId: string;
    from?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const pid = String(postId ?? "");

  // ✅ smart back (doesn't change your thread logic)
  const fromPath = typeof from === "string" && from.length > 0 ? from : null;

  const { userId } = useAuth();
  const { isReady, getPostById, getProfileById, listRepliesForPost, deletePost } = useAppData();

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

  const thread = useMemo(() => {
    if (!root) return null;

    const result: Post[] = [root];

    const walk = (parentId: string) => {
      const children = listRepliesForPost(parentId);
      for (const child of children) {
        result.push(child);
        walk(String(child.id));
      }
    };

    walk(String(root.id));
    return result;
  }, [root, listRepliesForPost]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ✅ added header config here so back works reliably */}
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Post",
          headerTitleAlign: "center",
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (fromPath) {
                  router.replace(fromPath as any);
                  return;
                }
                router.back();
              }}
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
      ) : !root || !thread ? (
        <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Post not found.</ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={thread}
          keyExtractor={(i) => String(i.id)}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item }) => {
            const itemId = String(item.id);

            const authorProfileId = item.authorProfileId ? String(item.authorProfileId) : "";
            const profile = authorProfileId ? getProfileById(authorProfileId) : null;
            if (!profile) return null;

            const parent = item.parentPostId ? getPostById(String(item.parentPostId)) : null;
            const parentProfile = parent?.authorProfileId
              ? getProfileById(String(parent.authorProfileId))
              : null;

            const isRoot = itemId === String(root.id);
            const variant = isRoot ? "detail" : "reply";

            const canEdit = canEditPost({ authorProfile: profile, userId });

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
  sep: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
});
