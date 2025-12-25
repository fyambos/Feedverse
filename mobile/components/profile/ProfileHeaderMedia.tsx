// mobile/components/profile/ProfileHeaderMedia.tsx
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

type ColorsLike = {
  border: string;
  pressed: string;
};

type Props = {
  colors: ColorsLike;
  headerUri: string | null;
  showCameras: boolean;
  picking: boolean;
  onOpenLightbox: () => void;
  onChangeHeader: () => void;
};

export function ProfileHeaderMedia({
  colors,
  headerUri,
  showCameras,
  picking,
  onOpenLightbox,
  onChangeHeader,
}: Props) {
  return (
    <View style={[styles.headerMediaWrap, { backgroundColor: colors.border }]}>
      {headerUri ? <Image source={{ uri: headerUri }} style={styles.headerMedia} /> : null}

      <Pressable
        onPress={onOpenLightbox}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="View header"
      />

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [
          styles.backBtn,
          { backgroundColor: "rgba(0,0,0,0.55)", opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-left" size={24} color="#fff" />
      </Pressable>

      {showCameras ? (
        <View style={styles.headerControls}>
          <Pressable
            onPress={onChangeHeader}
            disabled={picking}
            hitSlop={12}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && { opacity: 0.75 },
              picking && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change header"
          >
            <Ionicons name="camera" size={16} color="#fff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerMediaWrap: { height: 140, width: "100%", overflow: "hidden", position: "relative" },
  headerMedia: { width: "100%", height: "100%" },

  backBtn: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: [{ translateY: -17 }],
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    zIndex: 10,
  },

  headerControls: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", gap: 10, zIndex: 10 },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
