// mobile/components/profile/ProfileTabsBar.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  border: string;
  text: string;
  textSecondary: string;
  tint: string;
};

export function ProfileTabsBar({ colors }: { colors: ColorsLike }) {
  return (
    <View style={[styles.tabsBar, { borderBottomColor: colors.border }]}>
      <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
        <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
          Posts
        </ThemedText>
        <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
      </Pressable>

      <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Replies</ThemedText>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Media</ThemedText>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Likes</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBar: { flexDirection: "row", justifyContent: "space-around", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", gap: 8 },
  tabUnderline: { height: 4, width: 48, borderRadius: 999, marginTop: 6 },
});
