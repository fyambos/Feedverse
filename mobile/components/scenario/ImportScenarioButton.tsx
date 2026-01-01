// mobile/components/scenario/ImportScenarioButton.tsx
import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function ImportScenarioButton({
  onPress,
  color,
  style,
}: {
  onPress: () => void;
  color: string;
  style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Import scenario"
    >
      <Ionicons name="cloud-upload-outline" size={22} color={color} />
    </Pressable>
  );
}