import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ThemedText } from "@/components/themed-text";

// props: names array, variant: 'thread'|'list'
export function TypingIndicator({ names, variant = "thread", color }: { names: string[]; variant?: "thread" | "list"; color?: string }) {
  if (!names || names.length === 0) return null;

  // render like iPhone: name(s) + animated dots (simple static dots for now)
  const text = (() => {
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    const firstTwo = `${names[0]}, ${names[1]}`;
    return `${firstTwo} and ${names.length - 2} more are typing...`;
  })();

  return (
    <View style={variant === "thread" ? styles.threadWrap : styles.listWrap}>
      <ThemedText style={[variant === "thread" ? styles.threadText : styles.listText, color ? { color } : null]} numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  threadWrap: { paddingHorizontal: 14, paddingBottom: 6 },
  listWrap: { paddingVertical: 6, paddingHorizontal: 12 },
  threadText: { fontSize: 12 },
  listText: { fontSize: 13 },
});

export default TypingIndicator;
