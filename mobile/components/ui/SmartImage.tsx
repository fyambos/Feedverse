import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { Image as ExpoImage, type ImageContentFit } from "expo-image";

function normalizeRemoteUri(input: string): string {
  const trimmed = input.trim();

  // Avoid cleartext HTTP on Android when possible.
  const upgraded =
    Platform.OS === "android" && trimmed.startsWith("http://")
      ? `https://${trimmed.slice("http://".length)}`
      : trimmed;

  try {
    return new URL(upgraded).toString();
  } catch {
    // Best-effort for common bad cases (spaces).
    return upgraded.replace(/\s/g, "%20");
  }
}

export function SmartImage({
  uri,
  style,
  backgroundColor = "#111",
  contentFit = "cover",
  debugTag,
}: {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  backgroundColor?: string;
  contentFit?: ImageContentFit;
  debugTag?: string;
}) {
  if (!uri || typeof uri !== "string" || uri.trim().length === 0) {
    return <View style={[styles.fallback, { backgroundColor }, style as any]} />;
  }

  const normalized = normalizeRemoteUri(uri);

  return (
    <ExpoImage
      source={{ uri: normalized }}
      style={[styles.image, { backgroundColor }, style]}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      transition={150}
      onError={(e) => {
        if (__DEV__) {
          const message = (e as any)?.error ?? "unknown";
          console.warn(
            `[SmartImage] failed${debugTag ? ` (${debugTag})` : ""}:`,
            message,
            normalized,
          );
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
  },
});
