// mobile/components/post/Post.tsx

import React from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AntDesign from "@expo/vector-icons/AntDesign";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import type { Post as DbPost, Profile } from "@/data/db/schema";

import { Avatar } from "@/components/ui/Avatar";
import { formatCount, formatDetailTimestamp } from "@/lib/format";

import { PostActions } from "@/components/post/PostActions";
import { PostHeader } from "@/components/post/PostHeader";
import { PostBody } from "@/components/post/PostBody";

export type PostVariant = "feed" | "detail" | "reply";

type Props = {
  scenarioId: string;
  profile: Profile;
  item: DbPost;
  variant?: PostVariant;
  replyingTo?: string;
  showActions?: boolean;
  showThreadLine?: boolean;

  // likes
  isLiked?: boolean;
  onLike?: () => void;

  // reposts
  isReposted?: boolean;
  onRepost?: () => void | Promise<void>;

  // ✅ label shown above the post (ex: "retweeted by you")
  repostedByLabel?: string | null;
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

function pluralize(n: number, singular: string, plural?: string) {
  const p = plural ?? `${singular}s`;
  return n === 1 ? singular : p;
}

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

export function Post({
  scenarioId,
  profile,
  item,
  variant = "feed",
  replyingTo,
  showActions = true,
  showThreadLine = false,

  isLiked = false,
  onLike,

  isReposted = false,
  onRepost,

  repostedByLabel = null,
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const isDetail = variant === "detail";
  const isReply = variant === "reply" || (!!item.parentPostId && variant !== "detail");

  const { scenarioId: scenarioIdParam } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? item.scenarioId ?? scenarioIdParam ?? "");

  const openProfile = (view?: ProfileViewState) => {
    if (!sid || !profile.id) return;

    router.push({
      pathname: `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(profile.id)}`,
      params: view ? { view } : {},
    } as any);
  };

  const replyCount = item.replyCount ?? 0;
  const repostCount = item.repostCount ?? 0;
  const likeCount = item.likeCount ?? 0;

  const hasDetailCounts = isDetail && (repostCount > 0 || likeCount > 0);

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

  const [menuOpen, setMenuOpen] = React.useState(false);
  const REPORT_LABEL = "Report post";

  const STATE_OPTIONS = React.useMemo(
    () => [
      "Blocked account",
      "Muted account",
      "Blocked by account",
      "Suspended account",
      "Deactivated account",
      "Reactivated account",
      "Private account",
    ],
    []
  );

  const onReportPost = () => {
    setMenuOpen(false);
    Alert.alert("Report post", "Coming soon.");
  };

  const onStateOption = (label: string) => {
    setMenuOpen(false);
    const view = menuLabelToView(label);
    if (view) openProfile(view);
  };

  const MenuModal = () => (
    <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
        <Pressable style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Pressable
            onPress={onReportPost}
            style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
          >
            <ThemedText style={{ color: "#ff3b30", fontSize: 15, fontWeight: "600" }}>
              {REPORT_LABEL}
            </ThemedText>
          </Pressable>

          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

          {STATE_OPTIONS.map((label) => (
            <Pressable
              key={label}
              onPress={() => onStateOption(label)}
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 15 }}>{label}</ThemedText>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ===== DETAIL =====
  if (isDetail) {
    return (
      <View style={styles.wrap}>
        <PostHeader
          variant="detail"
          colors={colors}
          profile={profile}
          createdAtIso={item.createdAt}
          onOpenProfile={() => openProfile()}
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
            isLiked={isLiked}
            onLike={onLike}
            isReposted={isReposted}
            onRepost={onRepost}
          />
        )}
      </View>
    );
  }

  // ===== FEED / REPLY =====
  const replyingToHandle = replyingTo ? replyingTo : "";

  return (
    <View style={styles.wrapReply}>
      {/* ✅ repost banner */}
      {repostedByLabel ? (
        <View style={styles.repostBanner}>
          <AntDesign name="retweet" size={14} color={colors.tint} />
          <ThemedText style={[styles.repostBannerText, { color: colors.textSecondary }]}>
            {repostedByLabel}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.avatarCol}>
          {showThreadLine ? <View style={[styles.threadLine, { backgroundColor: colors.border }]} /> : null}

          <Pressable onPress={() => openProfile()} hitSlop={0} style={styles.avatarPress}>
            <Avatar uri={profile.avatarUrl} size={44} fallbackColor={colors.border} />
          </Pressable>
        </View>

        <View style={styles.rightCol}>
          <PostHeader
            variant={isReply ? "reply" : "feed"}
            colors={colors}
            profile={profile}
            createdAtIso={item.createdAt}
            isReply={isReply}
            replyingToHandle={replyingToHandle}
            onOpenProfile={() => openProfile()}
            onOpenMenu={() => setMenuOpen(true)}
          />

          <MenuModal />

          <PostBody sid={sid} variant={isReply ? "reply" : "feed"} colors={colors} item={item} isReply={isReply} />

          {showActions && (
            <PostActions
              variant={isReply ? "reply" : "feed"}
              colors={colors}
              replyCount={replyCount}
              repostCount={repostCount}
              likeCount={likeCount}
              onReply={onReply}
              onQuote={onQuote}
              isLiked={isLiked}
              onLike={onLike}
              isReposted={isReposted}
              onRepost={onRepost}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 12 },
  wrapReply: { paddingHorizontal: 16, paddingVertical: 4 },

  repostBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 44 + 12, // align with text column
    paddingBottom: 2,
    paddingTop: 2,
  },
  repostBannerText: { fontSize: 13, fontWeight: "600" },

  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rightCol: { flex: 1, paddingTop: 0 },
  avatarPress: { alignSelf: "flex-start" },

  dateLine: { marginTop: 12, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },

  countsRow: { flexDirection: "row", gap: 16 },
  countItem: { fontSize: 14 },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  menuSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginVertical: 6,
    marginHorizontal: 8,
  },

  avatarCol: { width: 44, alignItems: "center", position: "relative", alignSelf: "stretch" },
  threadLine: {
    position: "absolute",
    top: 50,
    bottom: 0,
    width: 2,
    borderRadius: 4,
    opacity: 0.85,
  },
});