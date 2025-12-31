// mobile/components/post/PostQuoted.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { useAppData } from "@/context/appData";
import type { Post as DbPost, Profile } from "@/data/db/schema";
import type { StyleProp, ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Post } from "@/components/post/Post";

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

  return (
    <Pressable
      onPress={() => {
        if (!sid) return;
        router.push(
          `/(scenario)/${encodeURIComponent(sid)}/post/${String(post.id)}` as any
        );
      }}
      style={({ pressed }) => [
        containerStyle,
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      {/* Use the real Post component, but make it quote-safe (no nested quotes, no menu/actions). */}
      <View style={styles.postWrap} pointerEvents="none">
        <Post
          scenarioId={sid}
          profile={profile}
          item={post}
          variant="feed"
          showActions={false}
          showThreadLine={false}
          showMenu={false}
          showQuoted={false} // stops quote recursion (quote-of-quote)
        />
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

  postWrap: { paddingVertical: 6 },

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