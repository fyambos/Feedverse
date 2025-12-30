// mobile/components/post/PostMenu.tsx
import React from "react";
import { Modal, Pressable, StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile, Post as DbPost } from "@/data/db/schema";

type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  text: string;
  textSecondary: string;
};

type ProfileViewState =
  | "normal"
  | "muted"
  | "blocked"
  | "blocked_by"
  | "suspended"
  | "deactivated"
  | "reactivated"
  | "reported"
  | "privated";

type Props = {
  visible: boolean;
  onClose: () => void;

  colors: ColorsLike;

  isCampaign: boolean;
  profile: Profile; // author of the post
  item: DbPost;

  // normal menu wiring
  onReportPost: () => void;
  onOpenProfile: (view?: ProfileViewState) => void;

  // ✅ new: open the GM editor instead of alerting
  onOpenGmEditor?: () => void;
};

function menuLabelToView(label: string): ProfileViewState | null {
  switch (label) {
    case "Blocked account":
      return "blocked";
    case "Blocked by account":
      return "blocked_by";
    case "Suspended account":
      return "suspended";
    case "Deactivated account":
      return "deactivated";
    case "Reactivated account":
      return "reactivated";
    case "Privated account":
      return "privated";
    case "Muted account":
      return "muted";
    default:
      return null;
  }
}

type MenuItem = {
  key: string;
  label: string;
  emoji?: string;
  danger?: boolean;
  onPress: () => void;
};

type MenuSection = {
  title: string;
  emoji?: string;
  items: MenuItem[];
};

export function PostMenu({
  visible,
  onClose,
  colors,
  isCampaign,
  profile,
  item,
  onReportPost,
  onOpenProfile,
  onOpenGmEditor,
}: Props) {
  const insets = useSafeAreaInsets();

  // -------- NORMAL MENU --------
  const REPORT_LABEL = "Report post";

  const STATE_OPTIONS = React.useMemo(
    () => [
      "Blocked account",
      "Muted account",
      "Blocked by account",
      "Suspended account",
      "Deactivated account",
      "Reactivated account",
      "Privated account",
    ],
    []
  );

  const onStateOption = (label: string) => {
    onClose();
    const view = menuLabelToView(label);
    if (view) onOpenProfile(view);
  };

  // ✅ CAMPAIGN MENU: no more Alert
  const GM_SECTIONS: MenuSection[] = React.useMemo(
    () => [
      {
        title: "GM",
        emoji: "⚙️",
        items: [
          {
            key: "open_editor",
            emoji: "🧾",
            label: "Open GM editor…",
            onPress: () => {
              onClose();
              onOpenGmEditor?.();
            },
          },
        ],
      },
      {
        title: "Target",
        emoji: "🎯",
        items: [
          { key: "target_author", emoji: "👤", label: "Target: author (default)", onPress: () => {} },
          { key: "target_change", emoji: "🔁", label: "Change target…", onPress: () => {} },
          { key: "target_multi", emoji: "👥", label: "Apply to multiple…", onPress: () => {} },
        ],
      },
      {
        title: "HP",
        emoji: "❤️",
        items: [
          { key: "hp_m5", emoji: "➖", label: "HP −5", onPress: () => {} },
          { key: "hp_m1", emoji: "➖", label: "HP −1", onPress: () => {} },
          { key: "hp_p1", emoji: "➕", label: "HP +1", onPress: () => {} },
          { key: "hp_p5", emoji: "➕", label: "HP +5", onPress: () => {} },
          { key: "hp_set", emoji: "🧾", label: "Set HP…", onPress: () => {} },
          { key: "hp_set_max", emoji: "📌", label: "Set Max HP…", onPress: () => {} },
          { key: "hp_full", emoji: "💚", label: "Heal to Max", onPress: () => {} },
          { key: "hp_down", emoji: "💀", label: "Down / KO (0 HP)", onPress: () => {} },
          { key: "hp_revive", emoji: "✨", label: "Revive (1 HP)", onPress: () => {} },
        ],
      },
      {
        title: "Level",
        emoji: "📈",
        items: [
          { key: "lvl_p1", emoji: "📈", label: "Level +1", onPress: () => {} },
          { key: "lvl_m1", emoji: "📉", label: "Level −1", onPress: () => {} },
          { key: "lvl_set", emoji: "🗒️", label: "Set Level…", onPress: () => {} },
        ],
      },
      {
        title: "Stats",
        emoji: "🧬",
        items: [
          { key: "stat_p1", emoji: "🟢", label: "Stat +1…", onPress: () => {} },
          { key: "stat_m1", emoji: "🔴", label: "Stat −1…", onPress: () => {} },
          { key: "stat_set", emoji: "🧰", label: "Set Stats…", onPress: () => {} },
        ],
      },
      {
        title: "Status",
        emoji: "🏷️",
        items: [{ key: "status_set", emoji: "🏷️", label: "Set Status…", onPress: () => {} }],
      },
      {
        title: "Utility",
        emoji: "🛠️",
        items: [
          { key: "open_sheet", emoji: "📄", label: "Open character sheet", onPress: () => {} },
          { key: "copy_snapshot", emoji: "📋", label: "Copy sheet snapshot", onPress: () => {} },
          { key: "reset", emoji: "🧨", label: "Reset to defaults…", danger: true, onPress: () => {} },
        ],
      },
    ],
    [onOpenGmEditor]
  );

  const NORMAL_SECTIONS: MenuSection[] = React.useMemo(
    () => [
      {
        title: "Post",
        emoji: "🚩",
        items: [
          {
            key: "report",
            emoji: "🚩",
            label: REPORT_LABEL,
            danger: true,
            onPress: () => {
              onClose();
              onReportPost();
            },
          },
        ],
      },
      {
        title: "Profile",
        emoji: "👤",
        items: STATE_OPTIONS.map((label) => ({
          key: label,
          emoji:
            label === "Blocked account"
              ? "⛔️"
              : label === "Muted account"
              ? "🔇"
              : label === "Blocked by account"
              ? "🚫"
              : label === "Suspended account"
              ? "🧊"
              : label === "Deactivated account"
              ? "🛑"
              : label === "Reactivated account"
              ? "✅"
              : label === "Privated account"
              ? "🔒"
              : "⚙️",
          label,
          onPress: () => onStateOption(label),
        })),
      },
    ],
    [STATE_OPTIONS]
  );

  const sections = isCampaign ? GM_SECTIONS : NORMAL_SECTIONS;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeRoot} edges={["left", "right", "bottom"]}>
        <Pressable style={styles.menuBackdrop} onPress={onClose}>
          <Pressable
            style={[
              styles.menuSheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: 10 + insets.bottom,
              },
            ]}
            onPress={() => {}}
          >
            {/* Header (author profile) */}
            <View style={styles.menuHeaderRow}>
              <View style={styles.menuHeaderAuthorRow}>
                <Avatar uri={profile.avatarUrl} size={28} fallbackColor={colors.border} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
                    {profile.displayName}
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                    @{profile.handle}
                  </ThemedText>
                </View>
              </View>

              <ThemedText style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }} numberOfLines={1}>
                {isCampaign ? "⚙️ gm quick actions" : "⋯ post options"}
              </ThemedText>
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {sections.map((sec, idx) => (
                <View key={sec.title}>
                  <ThemedText style={[styles.menuSectionTitle, { color: colors.textSecondary }]}>
                    {sec.emoji ? `${sec.emoji} ` : ""}
                    {sec.title}
                  </ThemedText>

                  {sec.items.map((it) => (
                    <Pressable
                      key={it.key}
                      onPress={it.onPress}
                      style={({ pressed }) => [
                        styles.menuItem,
                        { backgroundColor: pressed ? colors.pressed : "transparent" },
                      ]}
                    >
                      <View style={styles.menuItemRow}>
                        {it.emoji ? (
                          <ThemedText style={{ fontSize: 16, width: 22, textAlign: "center" }}>{it.emoji}</ThemedText>
                        ) : null}
                        <ThemedText
                          style={{
                            color: it.danger ? "#ff3b30" : colors.text,
                            fontSize: 15,
                            fontWeight: it.danger ? "700" : "500",
                            flex: 1,
                          }}
                        >
                          {it.label}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}

                  {idx < sections.length - 1 ? <View style={[styles.menuDivider, { backgroundColor: colors.border }]} /> : null}
                </View>
              ))}
            </ScrollView>

            {/* Cancel */}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.background },
              ]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>✕ Cancel</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },

  menuSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 8,
  },

  menuHeaderRow: { paddingHorizontal: 10, paddingTop: 2, paddingBottom: 6, gap: 2 },

  menuHeaderAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  menuSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },

  menuItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },

  menuItemRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  menuDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginVertical: 8,
    marginHorizontal: 8,
  },

  cancelBtn: {
    marginTop: 8,
    marginHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});