// mobile/components/profile/ProfilePostsList.tsx
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

  items: DbPost[];
  initialLoading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;

  getProfileById: (id: string) => Profile | undefined;
  userId: string | null;
  onDeletePost: (postId: string) => Promise<void>;

  ListHeaderComponent: React.ReactElement;
};

export function ProfilePostsList({
  colors,
  sid,
  items,
  initialLoading,
  loadingMore,
  onLoadMore,
  getProfileById,
  userId,
  onDeletePost,
  ListHeaderComponent,
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
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, opacity: 0.9 }} />
      )}
      contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 24 : 16 }}
      ListHeaderComponent={ListHeaderComponent}
      renderItem={({ item }) => {
        const authorProfile = getProfileById(String(item.authorProfileId));
        if (!authorProfile) return null;

        const canEditThisPost = canEditPost({ authorProfile, userId });

        const row = (
          <Pressable
            onPress={() => router.push(`/(scenario)/${sid}/(tabs)/post/${String(item.id)}` as any)}
            style={({ pressed }) => [{ backgroundColor: pressed ? colors.pressed : colors.background }]}
          >
            <PostCard scenarioId={sid} profile={authorProfile} item={item} variant="feed" showActions />
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
                params: { scenarioId: sid, mode: "edit", postId: String(item.id) },
              } as any);
            }}
            onDelete={() => {
              // keep UI confirm outside if you prefer — left here minimal to avoid duplicating Alert
              // you can wrap onDeletePost with an Alert in the page
              onDeletePost(String(item.id));
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
            <ThemedText style={{ color: colors.textSecondary }}>No posts yet.</ThemedText>
          </View>
        );
      }}
    />
  );
}
