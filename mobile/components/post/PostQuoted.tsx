// mobile/components/post/PostQuoted.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { useAppData } from "@/context/appData";
import type { Post as DbPost, Profile } from "@/data/db/schema";
import type { StyleProp, ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Avatar } from "@/components/ui/Avatar";
import { PostHeader } from "@/components/post/PostHeader";
import { PostBody } from "@/components/post/PostBody";

type ColorsLike = {
  border: string;
  background: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

type Props = {
  sid: string;
  isDetail: boolean;
  quotedPostId?: string | number | null;
  colors: ColorsLike;
};

export function PostQuoted({ sid, isDetail, quotedPostId, colors }: Props) {
  const { getPostById, getProfileById } = useAppData();

  const quoted = React.useMemo(() => {
    if (!quotedPostId) {
      return {
        missing: false,
        payload: null as null | { post: DbPost; profile: Profile },
      };
    }

    const qPost = getPostById(String(quotedPostId));
    if (!qPost) return { missing: true, payload: null };

    const qProfile = getProfileById(String(qPost.authorProfileId));
    if (!qProfile) return { missing: true, payload: null };

    return { missing: false, payload: { post: qPost, profile: qProfile } };
  }, [quotedPostId, getPostById, getProfileById]);

  if (!quotedPostId) return null;

  const containerStyle: StyleProp<ViewStyle> = [
    styles.quoteCard,
    { borderColor: colors.border, backgroundColor: colors.background },
  ];

  // deleted / missing
  if (quoted.missing) {
    return (
      <View style={containerStyle}>
        <View style={styles.missingInner}>
          <View style={[styles.missingDot, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: "800", color: colors.text }}>
              Post unavailable
            </ThemedText>
            <ThemedText
              style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}
            >
              This post has been deleted.
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }

  if (!quoted.payload) return null;

  const { post, profile } = quoted.payload;
  const addVideoIcon = Boolean((post as any).addVideoIcon);

  return (
    <Pressable
      onPress={() => {
        if (!sid) return;
        router.push({
          pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
          params: { scenarioId: sid, postId: String(post.id) },
        } as any);
      }}
      style={({ pressed }) => [containerStyle, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={styles.inner} pointerEvents="none">
        <View style={styles.row}>
          <Avatar uri={profile.avatarUrl} size={36} fallbackColor={colors.border} />
          <View style={styles.content}>
            <PostHeader
              variant="feed"
              colors={colors as any}
              profile={profile}
              createdAtIso={post.createdAt}
              onOpenProfile={() => {}}
              onOpenMenu={() => {}}
              showMenu={false}
              isInteractive={false}
              showTimestamps={false}
            />
            <PostBody sid={sid} variant="feed" colors={colors} item={post} addVideoIcon={addVideoIcon} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quoteCard: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },

  inner: { padding: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  content: { flex: 1 },

  missingInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 12,
  },
  missingDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    marginTop: 2,
  },
});