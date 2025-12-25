import React from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import type { Post as DbPost, Profile } from "@/data/db/schema";

import { Avatar } from "@/components/ui/Avatar";
import { formatCount, formatDetailTimestamp } from "@/lib/format";

import { PostActions } from "@/components/post/PostActions";
import { PostHeader } from "@/components/post/PostHeader";
import { PostBody } from "@/components/post/PostBody";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PostVariant = "feed" | "detail" | "reply";

type Props = {
  scenarioId: string;
  profile: Profile;
  item: DbPost;
  variant?: PostVariant;
  replyingTo?: string;
  showActions?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pluralize(n: number, singular: string, plural?: string) {
  const p = plural ?? `${singular}s`;
  return n === 1 ? singular : p;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function Post({
  scenarioId,
  profile,
  item,
  variant = "feed",
  replyingTo,
  showActions = true,
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const isDetail = variant === "detail";
  const isReply = variant === "reply" || (!!item.parentPostId && variant !== "detail");

  // keep old behavior where openProfile uses route param if needed
  const { scenarioId: scenarioIdParam } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? item.scenarioId ?? scenarioIdParam ?? "");

  const profileIdSlug = profile.id;

  const openProfile = () => {
    if (!sid || !profileIdSlug) return;
    router.push(
      `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(
        profileIdSlug
      )}` as any
    );
  };

  const replyCount = item.replyCount ?? 0;
  const repostCount = item.repostCount ?? 0;
  const likeCount = item.likeCount ?? 0;

  const hasDetailCounts = isDetail && (repostCount > 0 || likeCount > 0);

  // ----- actions
  const onReply = () => {
    if (!sid) return;
    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid, parentPostId: String(item.id) },
    } as any);
  };

  const onQuote = () => {
    if (!sid) return;
    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid, quotedPostId: String(item.id) },
    } as any);
  };

  // ----- menu
  const [menuOpen, setMenuOpen] = React.useState(false);

  const MENU_OPTIONS = React.useMemo(
    () => [
      "Block account",
      "Report post",
      "Mute account",
      "Get Blocked",
      "Suspend account",
      "Deactivate account",
      "Reactivate account",
    ],
    []
  );

  const onMenuOption = (label: string) => {
    setMenuOpen(false);
    Alert.alert("Coming soon", label);
  };

  const MenuModal = () => (
    <Modal
      transparent
      visible={menuOpen}
      animationType="fade"
      onRequestClose={() => setMenuOpen(false)}
    >
      <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
        <Pressable
          style={[
            styles.menuSheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          {MENU_OPTIONS.map((label) => (
            <Pressable
              key={label}
              onPress={() => onMenuOption(label)}
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? colors.pressed : "transparent" },
              ]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 15 }}>{label}</ThemedText>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ===== DETAIL VIEW =====
  if (isDetail) {
    return (
      <View style={styles.wrap}>
        <PostHeader
          variant="detail"
          colors={colors}
          profile={profile}
          createdAtIso={item.createdAt}
          onOpenProfile={openProfile}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <MenuModal />

        <PostBody sid={sid} variant="detail" colors={colors} item={item} />

        <ThemedText style={[styles.dateLine, { color: colors.textSecondary }]}>
          {formatDetailTimestamp(item.createdAt)}
        </ThemedText>

        {hasDetailCounts && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.countsRow}>
              {repostCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(repostCount)}</ThemedText>{" "}
                  {pluralize(repostCount, "Repost")}
                </ThemedText>
              )}
              {likeCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(likeCount)}</ThemedText>{" "}
                  {pluralize(likeCount, "Like")}
                </ThemedText>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {showActions && (
          <PostActions
            variant="detail"
            colors={colors}
            replyCount={replyCount}
            repostCount={repostCount}
            likeCount={likeCount}
            onReply={onReply}
            onQuote={onQuote}
          />
        )}
      </View>
    );
  }

  // ===== FEED / REPLY VIEW =====
  const replyingToHandle = replyingTo ? replyingTo : "";

  return (
    <View style={styles.wrapReply}>
      <View style={styles.row}>
        <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
          <Avatar uri={profile.avatarUrl} size={44} fallbackColor={colors.border} />
        </Pressable>

        <View style={styles.rightCol}>
          <PostHeader
            variant={isReply ? "reply" : "feed"}
            colors={colors}
            profile={profile}
            createdAtIso={item.createdAt}
            isReply={isReply}
            replyingToHandle={replyingToHandle}
            onOpenProfile={openProfile}
            onOpenMenu={() => setMenuOpen(true)}
          />

          <MenuModal />

          <PostBody
            sid={sid}
            variant={isReply ? "reply" : "feed"}
            colors={colors}
            item={item}
            isReply={isReply}
          />

          {showActions && (
            <PostActions
              variant={isReply ? "reply" : "feed"}
              colors={colors}
              replyCount={replyCount}
              repostCount={repostCount}
              likeCount={likeCount}
              onReply={onReply}
              onQuote={onQuote}
            />
          )}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 12 },
  wrapReply: { paddingHorizontal: 16, paddingVertical: 4 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  rightCol: { flex: 1, paddingTop: 0 },
  avatarPress: { alignSelf: "flex-start" },

  dateLine: { marginTop: 12, fontSize: 13 },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },

  countsRow: { flexDirection: "row", gap: 16 },
  countItem: { fontSize: 14 },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  menuSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },

  menuItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
});
