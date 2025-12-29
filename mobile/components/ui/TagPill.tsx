// mobile/components/ui/TagPill.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  text: string;
  textSecondary: string;
  border: string;
  pressed: string;
};

export function TagPill({
  label,
  color,
  colors,
  onPress,
}: {
  label: string;
  color?: string;
  colors: ColorsLike;
  onPress?: () => void;
}) {
  const content = (
    <>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <ThemedText numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
        {label}
      </ThemedText>
    </>
  );

  if (!onPress) {
    return <View style={[styles.pill, { borderColor: colors.border }]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
      ]}
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 160,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});