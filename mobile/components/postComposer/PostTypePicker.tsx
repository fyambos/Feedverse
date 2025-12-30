// mobile/components/postComposer/PostTypePicker.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { POST_TYPES, PostType, chipStyleForType } from "@/lib/campaign/postTypes";

export function PostTypePicker({
  colors,
  value,
  onChange,
}: {
  colors: any;
  value: PostType;
  onChange: (t: PostType) => void;
}) {
  return (
    <View style={styles.wrap}>
      {POST_TYPES.map((t) => {
        const active = t.key === value;
        const s = chipStyleForType(colors, t.key);

        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? s.activeBg : s.bg,
                borderColor: active ? s.activeBorder : s.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText style={{ fontSize: 13, color: active ? s.activeText : s.emoji }}>
              {t.emoji}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, fontWeight: "800", color: active ? s.activeText : s.text }}>
              {t.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});