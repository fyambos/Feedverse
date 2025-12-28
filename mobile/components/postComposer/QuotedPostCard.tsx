// mobile/components/postComposer/QuotedPostCard.tsx
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { Post as DbPost, Profile } from "@/data/db/schema";
import { Post } from "@/components/post/Post";

type ColorsLike = {
  border: string;
  background: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

export function QuotedPostCard({
  quotedPost,
  colors,
  getProfileById,
  scenarioId,
}: {
  quotedPost: DbPost;
  colors: ColorsLike;
  getProfileById: (id: string) => Profile | null | undefined;
  scenarioId: string;
}) {
  const qpAuthor = useMemo(
    () => getProfileById(String(quotedPost.authorProfileId)),
    [quotedPost.authorProfileId, getProfileById]
  );

  // if author is missing, don't crash composer
  if (!qpAuthor) return null;

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Post
        scenarioId={scenarioId}
        profile={qpAuthor}
        item={quotedPost}
        variant="feed"
        showActions={false}
        showThreadLine={false}
        showMenu={false}
        isInteractive={false}
        showQuoted={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
});