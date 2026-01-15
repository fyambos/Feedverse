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
  refreshTick?: number;

  isReply?: boolean;
  replyingToHandle?: string;

  onOpenProfile: () => void;
  onOpenMenu: () => void;

  showMenu?: boolean;
  isInteractive?: boolean;

  showTimestamps?: boolean;
};

function clipText(input: unknown, maxChars: number) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  if (maxChars <= 1) return "…";
  return `${s.slice(0, maxChars - 1)}…`;
}

export function PostHeader({
  variant,
  colors,
  profile,
  createdAtIso,
  refreshTick,
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

  const safeDisplayName = clipText((profile as any)?.displayName, 50);
  const safeHandle = clipText((profile as any)?.handle, 20);

  const showLock = Boolean((profile as any)?.isPrivate);
  const rel = React.useMemo(() => formatRelativeTime(createdAtIso), [createdAtIso, refreshTick]);
  const wrapperKey = `${String(refreshTick ?? "")}::${createdAtIso}`;

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
      <View key={wrapperKey} style={styles.detailHeaderRow}>
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
                    ellipsizeMode="tail"
                  >
                    {safeDisplayName}
                  </ThemedText>
                  {LockIcon}
                </View>
              </Pressable>

              <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText
                  style={[styles.handleInline, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  @{safeHandle}
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
    <View key={wrapperKey} style={styles.headerRow}>
      <View style={styles.headerBlockLeft}>
        <View style={styles.headerNameRow}>
          <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
            <View style={styles.nameWithLock}>
              <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
                {safeDisplayName}
              </ThemedText>
              {LockIcon}
            </View>
          </Pressable>

          <Pressable onPress={onOpenProfile} hitSlop={0} style={styles.inlinePress}>
            <ThemedText
              style={[styles.handleInline, { color: colors.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              @{safeHandle}
              {showRelative && showTimestamps ? ` · ${rel}` : ""}
            </ThemedText>
          </Pressable>
        </View>

        {!!isReply && !!replyingToHandle && (
          <View style={styles.replyingInline}>
            <ThemedText style={[styles.replyingText, { color: colors.textSecondary }]}>
              Replying to <ThemedText type="link">@{replyingToHandle}</ThemedText>
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

  name: { fontSize: 16, flexShrink: 1, minWidth: 0, maxWidth: 200, lineHeight: 20 },
  nameDetail: { fontSize: 18 },

  nameWithLock: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },

  handleInline: {
    fontSize: 15,
    opacity: 0.9,
    minWidth: 0,
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
    flexShrink: 1,
    minWidth: 0,
  },
  replyingInline: { marginTop: 0 },
  replyingText: { fontSize: 16, lineHeight: 17, paddingBottom: 6, paddingTop: 2},

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
    flexShrink: 1,
    minWidth: 0,
  },

  inlinePress: { alignSelf: "flex-start", flexShrink: 1, minWidth: 0 },
  menuBtn: { padding: 6, borderRadius: 999, alignSelf: "flex-start" },
});