// mobile/components/profile-edit/ProfileAvatarPicker.tsx
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { ThemedText } from "@/components/themed-text";

export function ProfileAvatarPicker({
  avatarUrl,
  setAvatarUrl,
  colors,
}: {
  avatarUrl: string | null;
  setAvatarUrl: (uri: string | null) => void;
  colors: any;
}) {
  const [picking, setPicking] = React.useState(false);

  const pickAvatar = async () => {
    setPicking(true);
    try {
      const uri = await pickAndPersistOneImage({
        persistAs: "avatar",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (uri) setAvatarUrl(uri);
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {picking ? (
        <View style={styles.pickerOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}

      <Pressable onPress={pickAvatar} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        <Avatar uri={avatarUrl} size={96} fallbackColor={colors.border} />
      </Pressable>

      <Pressable onPress={pickAvatar} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
        <ThemedText style={{ color: colors.tint, marginTop: 8 }}>Change avatar</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
});