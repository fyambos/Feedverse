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

export type ProfileTab = "posts" | "replies" | "media" | "likes";

type Props = {
  colors: ColorsLike;
  activeTab: ProfileTab;
  onChangeTab: (t: ProfileTab) => void;
};

export function ProfileTabsBar({ colors, activeTab, onChangeTab }: Props) {
  const Tab = ({
    id,
    label,
  }: {
    id: ProfileTab;
    label: string;
  }) => {
    const isActive = activeTab === id;

    return (
      <Pressable
        onPress={() => onChangeTab(id)}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label} tab`}
      >
        <ThemedText type={isActive ? "defaultSemiBold" : "default"} style={{ color: isActive ? colors.text : colors.textSecondary }}>
          {label}
        </ThemedText>

        {isActive ? <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} /> : <View style={styles.tabUnderlineSpacer} />}
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabsBar, { borderBottomColor: colors.border }]}>
      <Tab id="posts" label="Posts" />
      <Tab id="replies" label="Replies" />
      <Tab id="media" label="Media" />
      <Tab id="likes" label="Likes" />
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", gap: 8 },
  tabUnderline: { height: 4, width: 48, borderRadius: 999, marginTop: 6 },
  tabUnderlineSpacer: { height: 4, width: 48, marginTop: 6, opacity: 0 },
});
