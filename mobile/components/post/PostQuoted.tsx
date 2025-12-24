import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Avatar } from "@/components/ui/Avatar";
import { useAppData } from "@/context/appData";
import { formatRelativeTime } from "@/lib/format";

import type { Post as DbPost, Profile } from "@/data/db/schema";
import type { StyleProp, ViewStyle } from "react-native";

type ColorsLike = {
  border: string;
  background: string;
  pressed: string;
  text: string;
  textSecondary: string;
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
    if (!quotedPostId) return { missing: false, payload: null as null | { post: DbPost; profile: Profile } };

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

  if (quoted.missing) {
    return (
      <View style={containerStyle}>
        <View style={styles.quoteInner}>
          <View style={[styles.quoteAvatarFallback, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: "800", color: colors.text }}>
              Post unavailable
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
              This post has been deleted.
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }

  if (!quoted.payload) return null;

  const { post, profile: qProfile } = quoted.payload;

  return (
    <Pressable
      onPress={() => {
        if (!sid) return;
        router.push(
          `/(scenario)/${encodeURIComponent(sid)}/(tabs)/post/${String(post.id)}` as any
        );
      }}
      style={({ pressed }) => [containerStyle, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={styles.quoteInner}>
        <Avatar uri={qProfile.avatarUrl} size={22} fallbackColor={colors.border} />

        <View style={{ flex: 1 }}>
          <View style={styles.quoteTopRow}>
            <ThemedText
              numberOfLines={1}
              style={{ fontWeight: "800", color: colors.text, maxWidth: "70%" }}
            >
              {qProfile.displayName}
            </ThemedText>

            <ThemedText
              numberOfLines={1}
              style={{ color: colors.textSecondary, marginLeft: 8, flexShrink: 1 }}
            >
              @{qProfile.handle}
            </ThemedText>

            {!isDetail && (
              <>
                <ThemedText style={{ color: colors.textSecondary }}> · </ThemedText>
                <ThemedText style={{ color: colors.textSecondary }}>
                  {formatRelativeTime(post.createdAt)}
                </ThemedText>
              </>
            )}
          </View>

          <ThemedText numberOfLines={3} style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}>
            {post.text}
          </ThemedText>
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
    padding: 12,
  },
  quoteInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  quoteAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 999,
    marginTop: 2,
  },
  quoteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
});
