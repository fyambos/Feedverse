//mobile/components/ui/Avatar.tsx 
import React from "react";
import { View, StyleSheet } from "react-native";
import { SmartImage } from "./SmartImage";

export function Avatar({
  uri,
  size = 44,
  fallbackColor = "#ddd",
  style,
}: {
  uri?: string | null;
  size?: number;
  fallbackColor?: string;
  style?: any;
}) {
  const base = { width: size, height: size, borderRadius: size / 2 };

  if (!uri) {
    return <View style={[styles.fallback, base, { backgroundColor: fallbackColor }, style]} />;
  }

  return (
    <SmartImage
      uri={uri}
      style={[base, style]}
      backgroundColor={fallbackColor}
      contentFit="cover"
      debugTag="Avatar"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {},
});
