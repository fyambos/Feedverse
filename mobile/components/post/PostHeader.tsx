import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Fontisto from "@expo/vector-icons/Fontisto";

import { Avatar } from "@/components/ui/Avatar";
import { ThemedText } from "@/components/themed-text";
import { formatRelativeTime } from "@/lib/format";
import type { Profile } from "@/data/db/schema";

type ColorsLike = {
  textSecondary: string;
  icon: string;
  border: string;
  text?: string; // optional for lock color fallback
};

type Props = {
  variant: "feed" | "detail" | "reply";
  colors: ColorsLike;

  profile: Profile;
  createdAtIso: string;

  isReply?: boolean;
  replyingToHandle?: string;

  onOpenProfile: () => void;
  onOpenMenu: () => void;

  showMenu?: boolean;
  isInteractive?: boolean;

  // ✅ NEW
  showTimestamps?: boolean;
};

export function PostHeader({
  variant,
  colors,
  profile,
  createdAtIso,
  isReply,
  replyingToHandle,
  onOpenProfile,
  onOpenMenu,
  showMenu = true,
  isInteractive = true,
  showTimestamps = true,
}: Props) {
  const isDetail = variant === "detail";
  const showRelative = !isDetail;

  const showLock = Boolean((profile as any)?.isPrivate);

  const LockIcon = showLock ? (
    <Fontisto
      name="locked"
      size={12}
      color={(colors as any).text ?? colors.icon}
      style={{ marginLeft: 6, marginTop: 2 }}
    />
  ) : null;

  if (isDetail) {
    return (
      <View style={styles.detailHeaderRow}>
        <View style={styles.detailHeaderLeft}>
          <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.avatarPress}>
            <Avatar uri={profile.avatarUrl} size={48} fallbackColor={colors.border} />
          </Pressable>

          <View style={styles.detailHeaderText}>
            <View style={styles.detailNameRow}>
              <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
                <View style={styles.nameWithLock}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.name, styles.nameDetail]}
                    numberOfLines={1}
                  >
                    {profile.displayName}
                  </ThemedText>
                  {LockIcon}
                </View>
              </Pressable>

              <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{profile.handle}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        {showMenu ? (
          <Pressable onPress={onOpenMenu} hitSlop={10} style={styles.menuBtn}>
            <Ionicons name="chevron-down" size={18} color={colors.icon} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  // feed / reply header
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerBlockLeft}>
        <View style={styles.headerNameRow}>
          <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
            <View style={styles.nameWithLock}>
              <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
                {profile.displayName}
              </ThemedText>
              {LockIcon}
            </View>
          </Pressable>

          <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
            <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
              @{profile.handle}
              {showRelative && showTimestamps ? ` · ${formatRelativeTime(createdAtIso)}` : ""}
            </ThemedText>
          </Pressable>
        </View>

        {!!isReply && !!replyingToHandle && (
          <View style={styles.replyingInline}>
            <ThemedText style={[styles.replyingText, { color: colors.textSecondary }]}>
              replying to <ThemedText type="link">@{replyingToHandle}</ThemedText>
            </ThemedText>
          </View>
        )}
      </View>

      {showMenu ? (
        <Pressable onPress={onOpenMenu} hitSlop={10} style={styles.menuBtn}>
          <Ionicons name="chevron-down" size={18} color={colors.icon} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarPress: { alignSelf: "flex-start" },

  name: { fontSize: 16, maxWidth: 160, lineHeight: 20 },
  nameDetail: { fontSize: 18 },

  nameWithLock: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },

  handleInline: {
    fontSize: 15,
    opacity: 0.9,
    flexShrink: 1,
    lineHeight: 20,
  },

  // feed/reply
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  headerBlockLeft: { flex: 1, flexDirection: "column", paddingRight: 8 },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "nowrap",
  },
  replyingInline: { marginTop: 0 },
  replyingText: { fontSize: 13, lineHeight: 17 },

  // detail
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  detailHeaderText: { flex: 1, justifyContent: "center" },
  detailNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
  },

  inlinePress: { alignSelf: "flex-start" },
  menuBtn: { padding: 6, borderRadius: 999, alignSelf: "flex-start" },
});