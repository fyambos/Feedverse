//mobile/components/ui/Avatar.tsx 
import React from "react";
import { Image, View, StyleSheet } from "react-native";

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

  return <Image source={{ uri }} style={[base, style]} />;
}

const styles = StyleSheet.create({
  fallback: {},
});
