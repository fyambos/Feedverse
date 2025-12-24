// mobile/components/ui/SwipeableRow.tsx
import React, { useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

type ColorsLike = {
  tint: string;
  pressed: string;
};

type Props = {
  enabled: boolean;

  // edit/delete handlers
  onEdit: () => void;
  onDelete: () => void;

  // visuals
  colors: ColorsLike;
  dangerColor?: string;

  // behavior
  actionsWidth?: number; // default 120
  rightThreshold?: number; // default 24
  friction?: number; // default 2

  children: React.ReactNode;
};

export function SwipeableRow({
  enabled,
  onEdit,
  onDelete,
  colors,
  dangerColor = "#F04438",
  actionsWidth = 120,
  rightThreshold = 24,
  friction = 2,
  children,
}: Props) {
  const swipeRef = useRef<SwipeableMethods | null>(null);

  const close = useCallback(() => {
    swipeRef.current?.close();
  }, []);

  const RightActions = useMemo(() => {
    return function RightActionsInner({ dragX }: { dragX: any }) {
      const animStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
          dragX.value,
          [-actionsWidth, 0],
          [0, actionsWidth],
          Extrapolation.CLAMP
        );
        return { transform: [{ translateX }] };
      });

      const pressedBg = colors.pressed;

      return (
        <Animated.View style={[styles.swipeActions, { width: actionsWidth }, animStyle]}>
          <Pressable
            onPress={() => {
              close();
              requestAnimationFrame(onEdit);
            }}
            style={({ pressed }) => [
              styles.swipeBtn,
              { backgroundColor: pressed ? pressedBg : "transparent", borderColor: colors.tint },
            ]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Edit"
          >
            <Ionicons name="pencil" size={22} color={colors.tint} />
          </Pressable>

          <Pressable
            onPress={() => {
              close();
              void Promise.resolve(onDelete());
            }}
            style={({ pressed }) => [
              styles.swipeBtn,
              { backgroundColor: pressed ? pressedBg : "transparent", borderColor: dangerColor },
            ]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <Ionicons name="trash-outline" size={22} color={dangerColor} />
          </Pressable>
        </Animated.View>
      );
    };
  }, [actionsWidth, close, colors.pressed, colors.tint, dangerColor, onDelete, onEdit]);

  if (!enabled) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      overshootRight={false}
      friction={friction}
      rightThreshold={rightThreshold}
      renderRightActions={(_progress, dragX) => <RightActions dragX={dragX} />}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeActions: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 12,
    gap: 10,
  },
  swipeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
