// mobile/components/postComposer/ComposerToolbar.tsx
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

export function ComposerToolbar({
  colors,
  onTakePhoto,
  onPickImages,
  onPickVideoThumb,
  leftTools,
}: {
  colors: any;
  onTakePhoto: () => void;
  onPickImages: () => void;
  onPickVideoThumb: () => void;
  leftTools?: React.ReactNode;
}) {
  return (
    <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
      <Pressable onPress={onTakePhoto} hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
        <Ionicons name="camera-outline" size={22} color={colors.tint} />
      </Pressable>

      <Pressable onPress={onPickImages} hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
        <Ionicons name="image-outline" size={22} color={colors.tint} />
      </Pressable>

      <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
        <MaterialIcons name="gif" size={22} color={colors.tint} />
      </Pressable>

      <Pressable onPress={onPickVideoThumb} hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
        <Ionicons name="videocam-outline" size={22} color={colors.tint} />
      </Pressable>

      {leftTools}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  toolBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
});