// mobile/components/postComposer/MediaGrid.tsx
import React from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function MediaGrid({
  colors,
  imageUrls,
  videoThumbUri,
  addVideoIcon,
  onRemoveImageAt,
  onClearMedia,
}: {
  colors: any;
  imageUrls: string[];
  videoThumbUri: string | null;
  addVideoIcon: boolean;
  onRemoveImageAt: (idx: number) => void;
  onClearMedia: () => void;
}) {
  if (videoThumbUri) {
    return (
      <View style={styles.mediaGrid}>
        <View style={[styles.mediaThumbWrap, styles.mediaThumbWrapSingle]}>
          <Image source={{ uri: videoThumbUri }} style={styles.mediaThumb} />

          {addVideoIcon ? (
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={56} color="#fff" />
            </View>
          ) : null}

          <Pressable
            onPress={onClearMedia}
            hitSlop={10}
            style={({ pressed }) => [
              styles.mediaRemove,
              {
                opacity: pressed ? 0.85 : 1,
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (!imageUrls.length) return null;

  return (
    <View style={styles.mediaGrid}>
      {imageUrls.map((uri, idx) => (
        <View
          key={`${uri}_${idx}`}
          style={[styles.mediaThumbWrap, imageUrls.length === 1 && styles.mediaThumbWrapSingle]}
        >
          <Image source={{ uri }} style={styles.mediaThumb} />
          <Pressable
            onPress={() => onRemoveImageAt(idx)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.mediaRemove,
              {
                opacity: pressed ? 0.85 : 1,
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mediaGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaThumbWrap: { width: "48%", aspectRatio: 1, borderRadius: 16, overflow: "hidden" },
  mediaThumbWrapSingle: { width: "100%", aspectRatio: 16 / 9 },
  mediaThumb: { width: "100%", height: "100%" },
  mediaRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
});