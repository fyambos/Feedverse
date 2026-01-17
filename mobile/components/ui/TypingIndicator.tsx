import React from "react";
import { Animated, Easing, StyleSheet, useColorScheme, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

// props: names array, variant: 'thread'|'list'
// - thread: iMessage-style bubble with animated dots
// - list: iMessage-style "Typing…" subtitle (no names)
export function TypingIndicator({
  names,
  variant = "thread",
  color,
}: {
  names: string[];
  variant?: "thread" | "list";
  color?: string;
}) {
  if (!names || names.length === 0) return null;

  if (variant === "list") {
    return (
      <View style={styles.listWrap}>
        <ThemedText style={[styles.listText, color ? { color } : null]} numberOfLines={1}>
          Typing…
        </ThemedText>
      </View>
    );
  }

  return <TypingBubble />;
}

function TypingBubble() {
  const scheme = useColorScheme() ?? "light";
  const bubbleColor = scheme === "dark" ? "#2C2C2E" : "#E5E5EA";
  const dotColor = scheme === "dark" ? "#F2F2F7" : "#3A3A3C";

  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => {
      try {
        anim.stop();
      } catch {}
    };
  }, [progress]);

  const dotOpacity = (offset: number) =>
    progress.interpolate({
      inputRange: [0 + offset, 0.18 + offset, 0.36 + offset, 1 + offset],
      outputRange: [0.35, 1, 0.35, 0.35],
      extrapolate: "clamp",
    });

  const dotTranslateY = (offset: number) =>
    progress.interpolate({
      inputRange: [0 + offset, 0.18 + offset, 0.36 + offset, 1 + offset],
      outputRange: [0, -2.5, 0, 0],
      extrapolate: "clamp",
    });

  return (
    <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: dotOpacity(0), transform: [{ translateY: dotTranslateY(0) }] }]} />
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: dotOpacity(0.16), transform: [{ translateY: dotTranslateY(0.16) }] }]} />
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: dotOpacity(0.32), transform: [{ translateY: dotTranslateY(0.32) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 16,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listWrap: { paddingVertical: 6, paddingHorizontal: 12 },
  listText: { fontSize: 13, fontStyle: "italic" },
});

export default TypingIndicator;
