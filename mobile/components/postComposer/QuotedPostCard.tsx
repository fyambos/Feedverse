// mobile/components/postComposer/QuotedPostCard.tsx
import React, { useMemo } from "react";
import { View, Image, StyleSheet } from "react-native";
import type { Post } from "@/data/db/schema";
import { ThemedText } from "@/components/themed-text";

export function QuotedPostCard({
  quotedPost,
  colors,
  getProfileById,
}: {
  quotedPost: Post;
  colors: any;
  getProfileById: (id: string) => any;
}) {
  const qpAuthor = useMemo(
    () => getProfileById(String(quotedPost.authorProfileId)),
    [quotedPost.authorProfileId, getProfileById]
  );

  return (
    <View style={styles.quoteInner}>
      {qpAuthor?.avatarUrl ? (
        <Image source={{ uri: qpAuthor.avatarUrl }} style={styles.quoteAvatar} />
      ) : (
        <View style={[styles.quoteAvatar, { backgroundColor: colors.border }]} />
      )}

      <View style={{ flex: 1 }}>
        <View style={styles.quoteTopRow}>
          <ThemedText numberOfLines={1} style={{ fontWeight: "800", color: colors.text, maxWidth: "70%" }}>
            {qpAuthor?.displayName ?? "Unknown"}
          </ThemedText>

          <ThemedText numberOfLines={1} style={{ color: colors.textSecondary, marginLeft: 8, flexShrink: 1 }}>
            @{qpAuthor?.handle ?? "unknown"}
          </ThemedText>

          <ThemedText style={{ color: colors.textSecondary }}> · </ThemedText>

          <ThemedText style={{ color: colors.textSecondary }}>
            {new Date(quotedPost.createdAt).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </ThemedText>
        </View>

        <ThemedText numberOfLines={3} style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}>
          {quotedPost.text}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quoteInner: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  quoteAvatar: { width: 22, height: 22, borderRadius: 999, marginTop: 2 },
  quoteTopRow: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap" },
});