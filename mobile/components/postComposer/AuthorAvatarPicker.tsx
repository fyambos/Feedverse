import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

export function AuthorAvatarPicker({
  colors,
  avatarUrl,
  onPress,
}: {
  colors: any;
  avatarUrl?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [pressed && { opacity: 0.75 }]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.border }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 42, height: 42, borderRadius: 999 },
});