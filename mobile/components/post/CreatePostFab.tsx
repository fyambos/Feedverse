// mobile/components/post/CreatePostFab.tsx

import React, { useRef } from "react";
import { Animated as RNAnimated, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function CreatePostFab({
  scenarioId,
  colors,
  onPress,
}: {
  scenarioId: string; // (not used inside, but nice to keep API consistent)
  colors: any;
  onPress: () => void;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;

  const pressIn = () => {
    RNAnimated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    RNAnimated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  return (
    <RNAnimated.View style={[styles.fab, { backgroundColor: colors.tint, transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        hitSlop={16}
        style={styles.fabPress}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </Pressable>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPress: { flex: 1, alignItems: "center", justifyContent: "center" },
});