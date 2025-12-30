// mobile/components/post/PostTypeBadge.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { POST_TYPES, PostType, chipStyleForType } from "@/lib/campaign/postTypes";

export function PostTypeBadge({
  colors,
  type,
  compact = false,
}: {
  colors: any;
  type?: PostType;
  compact?: boolean;
}) {
  if (!type || type === "rp") return null;

  const def = POST_TYPES.find((x) => x.key === type);
  if (!def) return null;

  const s = chipStyleForType(colors, type);

  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: s.bg, borderColor: s.border },
      ]}
    >
      <ThemedText
        style={[
          styles.emoji,
          compact && styles.emojiCompact,
          { color: s.emoji },
        ]}
      >
        {def.emoji}
      </ThemedText>

      {!compact && (
        <ThemedText style={{ fontSize: 12, fontWeight: "800", color: s.text }}>
          {def.label}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    },

  emoji: {
    fontSize: 12,
    },

  emojiCompact: {
    fontSize: 11,
    },
});