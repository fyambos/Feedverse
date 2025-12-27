import React from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Post as PostCard } from "@/components/post/Post";
import { SwipeableRow } from "@/components/ui/SwipeableRow";

import { router } from "expo-router";
import type { Post as DbPost, Profile } from "@/data/db/schema";
import { canEditPost } from "@/lib/permission";

type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  textSecondary: string;
};

type Props = {
  colors: ColorsLike;
  sid: string;

  viewingProfileId: string;

  items: DbPost[];
  initialLoading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;

  getProfileById: (id: string) => Profile | undefined;
  getPostById: (id: string) => DbPost | undefined;

  userId: string | null;
  onDeletePost: (postId: string) => Promise<void>;

  ListHeaderComponent: React.ReactElement;
  emptyText?: string;
  disableEngagement?: boolean;

  // ✅ NEW — optional like support
  getIsLiked?: (postId: string) => boolean;
  onLikePost?: (postId: string) => void | Promise<void>;
};

function findRootPostId(
  getPostById: (id: string) => DbPost | undefined,
  start: DbPost
): string {
  let cur: DbPost | undefined = start;
  const seen = new Set<string>();

  while (cur?.parentPostId) {
    const curId = String(cur.id);
    if (seen.has(curId)) break;
    seen.add(curId);

    const parent = getPostById(String(cur.parentPostId));
    if (!parent) break;

    cur = parent;
  }

  return String(cur?.id ?? start.id);
}

function getReplyingToHandle(
  getPostById: (id: string) => DbPost | undefined,
  getProfileById: (id: string) => Profile | undefined,
  post: DbPost
): string {
  if (!post.parentPostId) return "";
  const parent = getPostById(String(post.parentPostId));
  if (!parent) return "";
  const parentAuthor = getProfileById(String(parent.authorProfileId));
  return parentAuthor?.handle ?? "";
}

export function ProfilePostsList({
  colors,
  sid,
  viewingProfileId,
  items,
  initialLoading,
  loadingMore,
  onLoadMore,
  getProfileById,
  getPostById,
  userId,
  onDeletePost,
  ListHeaderComponent,
  emptyText,
  getIsLiked,
  onLikePost,
}: Props) {
  return (
    <FlatList
      data={items}
      keyExtractor={(p) => String(p.id)}
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (!initialLoading) onLoadMore();
      }}
      ListFooterComponent={() => {
        if (!loadingMore) return <View style={{ height: 24 }} />;
        return (
          <View style={{ paddingVertical: 16, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        );
      }}
      ItemSeparatorComponent={() => (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border,
            opacity: 0.9,
          }}
        />
      )}
      contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 24 : 16 }}
      ListHeaderComponent={ListHeaderComponent}
      renderItem={({ item }) => {
        const authorProfile = getProfileById(String(item.authorProfileId));
        if (!authorProfile) return null;

        const isReply = !!item.parentPostId;
        const replyingTo = isReply
          ? getReplyingToHandle(getPostById, getProfileById, item)
          : "";

        const targetPostId = isReply
          ? findRootPostId(getPostById, item)
          : String(item.id);

        const canEditThisPost = canEditPost({ authorProfile, userId });

        const postId = String(item.id);
        const isLiked = getIsLiked ? getIsLiked(postId) : false;

        const row = (
          <Pressable
            onPress={() =>
              router.push({
                pathname: `/(scenario)/${encodeURIComponent(
                  sid
                )}/(tabs)/post/${encodeURIComponent(targetPostId)}`,
                params: {
                  from: `/(scenario)/${encodeURIComponent(
                    sid
                  )}/(tabs)/profile/${encodeURIComponent(
                    String(viewingProfileId)
                  )}`,
                },
              } as any)
            }
            style={({ pressed }) => [
              { backgroundColor: pressed ? colors.pressed : colors.background },
            ]}
          >
            <PostCard
              scenarioId={sid}
              profile={authorProfile}
              item={item}
              variant={isReply ? "reply" : "feed"}
              replyingTo={replyingTo}
              showActions
              // ✅ LIKE SUPPORT
              isLiked={isLiked}
              onLike={
                onLikePost ? () => onLikePost(postId) : undefined
              }
            />
          </Pressable>
        );

        return (
          <SwipeableRow
            enabled={canEditThisPost}
            colors={colors as any}
            rightThreshold={40}
            onEdit={() => {
              router.push({
                pathname: "/modal/create-post",
                params: { scenarioId: sid, mode: "edit", postId },
              } as any);
            }}
            onDelete={() => {
              onDeletePost(postId);
            }}
          >
            {row}
          </SwipeableRow>
        );
      }}
      ListEmptyComponent={() => {
        if (initialLoading) {
          return (
            <View style={{ padding: 18 }}>
              <ActivityIndicator />
            </View>
          );
        }
        return (
          <View style={{ padding: 18 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              {emptyText ?? "No posts yet."}
            </ThemedText>
          </View>
        );
      }}
    />
  );
}