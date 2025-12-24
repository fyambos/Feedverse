// mobile/components/post/Post.tsx
import React from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SimpleLineIcons from "@expo/vector-icons/SimpleLineIcons";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import type { Post as DbPost, Profile } from "@/data/db/schema";
import { useAppData } from "@/context/appData";

import { Avatar } from "@/components/ui/Avatar";
import { formatCount, formatRelativeTime, formatDetailTimestamp } from "@/lib/format";

import { MediaGrid } from "@/components/media/MediaGrid";
import { Lightbox } from "@/components/media/lightBox";
import type { StyleProp, ViewStyle } from "react-native";
import { PostActions } from "@/components/post/PostActions";
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
  const showActionCounts = !isDetail;

  const { getPostById, getProfileById } = useAppData();

  // keep old behavior where openProfile uses route param if needed
  const { scenarioId: scenarioIdParam } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? item.scenarioId ?? scenarioIdParam ?? "");
  const handleSlug = profile.handle; // stored WITHOUT @

  const openProfile = () => {
    if (!sid || !handleSlug) return;
    router.push(
      `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(handleSlug)}` as any
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

  // small press animations
  const replyScale = React.useRef(new Animated.Value(1)).current;
  const repostScale = React.useRef(new Animated.Value(1)).current;

  const pop = (v: Animated.Value) => {
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
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

  // ----- quoted post resolution (DB only)
  const quoted = React.useMemo(() => {
    if (!item.quotedPostId) return { missing: false, payload: null as null | { post: DbPost; profile: Profile } };

    const qPost = getPostById(String(item.quotedPostId));
    if (!qPost) return { missing: true, payload: null };

    const qProfile = getProfileById(String(qPost.authorProfileId));
    if (!qProfile) return { missing: true, payload: null };

    return { missing: false, payload: { post: qPost, profile: qProfile } };
  }, [item.quotedPostId, getPostById, getProfileById]);

  const renderQuoted = () => {
    if (!item.quotedPostId) return null;


    // ...
    const containerStyle: StyleProp<ViewStyle> = [
      styles.quoteCard,
      { borderColor: colors.border, backgroundColor: colors.background },
    ];


    if (quoted.missing) {
      return (
        <View style={containerStyle}>
          <View style={styles.quoteInner}>
            <View style={[styles.quoteAvatarFallback, { backgroundColor: colors.border }]} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: "800", color: colors.text }}>Post unavailable</ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
                This post has been deleted.
              </ThemedText>
            </View>
          </View>
        </View>
      );
    }

    if (!quoted.payload) return null;

    const { post, profile: qProfile } = quoted.payload;

    return (
      <Pressable
        onPress={() => {
          if (!sid) return;
          router.push(`/(scenario)/${encodeURIComponent(sid)}/(tabs)/post/${String(post.id)}` as any);
        }}
        style={({ pressed }) => [containerStyle, pressed && { backgroundColor: colors.pressed }]}
      >
        <View style={styles.quoteInner}>
          <Avatar uri={qProfile.avatarUrl} size={22} fallbackColor={colors.border} />

          <View style={{ flex: 1 }}>
            <View style={styles.quoteTopRow}>
              <ThemedText
                numberOfLines={1}
                style={{ fontWeight: "800", color: colors.text, maxWidth: "70%" }}
              >
                {qProfile.displayName}
              </ThemedText>

              <ThemedText
                numberOfLines={1}
                style={{ color: colors.textSecondary, marginLeft: 8, flexShrink: 1 }}
              >
                @{qProfile.handle}
              </ThemedText>

              {!isDetail && (
                <>
                  <ThemedText style={{ color: colors.textSecondary }}> · </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary }}>
                    {formatRelativeTime(post.createdAt)}
                  </ThemedText>
                </>
              )}
            </View>

            <ThemedText
              numberOfLines={3}
              style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}
            >
              {post.text}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  // ----- media lightbox state
  const mediaUrls = (item.imageUrls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);

  const openLightbox = (idx: number) => {
    setLightboxIndex(Math.max(0, Math.min(idx, Math.max(0, mediaUrls.length - 1))));
    setLightboxOpen(true);
  };

  // ===== DETAIL VIEW =====
  if (isDetail) {
    return (
      <View style={styles.wrap}>
        {/* Header row */}
        <View style={styles.detailHeaderRow}>
          <View style={styles.detailHeaderLeft}>
            <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
              <Avatar uri={profile.avatarUrl} size={48} fallbackColor={colors.border} />
            </Pressable>

            <View style={styles.detailHeaderText}>
              <View style={styles.detailNameRow}>
                <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                  <ThemedText type="defaultSemiBold" style={[styles.name, styles.nameDetail]} numberOfLines={1}>
                    {profile.displayName}
                  </ThemedText>
                </Pressable>

                <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                  <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
                    @{profile.handle}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.menuBtn}>
            <Ionicons name="chevron-down" size={18} color={colors.icon} />
          </Pressable>
        </View>

        <MenuModal />

        {/* Text */}
        <ThemedText style={[styles.text, styles.textDetail]}>{item.text}</ThemedText>

        {/* Media */}
        {mediaUrls.length > 0 ? (
          <>
            <MediaGrid
              urls={mediaUrls}
              variant="detail"
              onOpen={openLightbox}
              backgroundColor={colors.border}
            />
            <Lightbox
              urls={mediaUrls}
              initialIndex={lightboxIndex}
              visible={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              allowSave
            />
          </>
        ) : null}

        {/* Quote */}
        {renderQuoted()}

        {/* Timestamp */}
        <ThemedText style={[styles.dateLine, { color: colors.textSecondary }]}>
          {formatDetailTimestamp(item.createdAt)}
        </ThemedText>

        {/* Counts */}
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

        {/* Actions */}
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
        {/* LEFT avatar */}
        <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
          <Avatar uri={profile.avatarUrl} size={44} fallbackColor={colors.border} />
        </Pressable>

        {/* RIGHT */}
        <View style={styles.rightCol}>
          {/* HEADER */}
          <View style={styles.headerRow}>
            <View style={styles.headerBlockLeft}>
              <View style={styles.headerNameRow}>
                <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                  <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
                    {profile.displayName}
                  </ThemedText>
                </Pressable>

                <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                  <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
                    @{profile.handle} · {formatRelativeTime(item.createdAt)}
                  </ThemedText>
                </Pressable>
              </View>

              {isReply && !!replyingToHandle && (
                <View style={styles.replyingInline}>
                  <ThemedText style={[styles.replyingText, { color: colors.textSecondary }]}>
                    replying to <ThemedText type="link">@{replyingToHandle}</ThemedText>
                  </ThemedText>
                </View>
              )}
            </View>

            <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.menuBtn}>
              <Ionicons name="chevron-down" size={18} color={colors.icon} />
            </Pressable>

            <MenuModal />
          </View>

          {/* CONTENT */}
          <ThemedText style={[styles.text, isReply && styles.textReply]}>{item.text}</ThemedText>

          {mediaUrls.length > 0 ? (
            <>
              <MediaGrid
                urls={mediaUrls}
                variant={isReply ? "reply" : "feed"}
                onOpen={openLightbox}
                backgroundColor={colors.border}
              />
              <Lightbox
                urls={mediaUrls}
                initialIndex={lightboxIndex}
                visible={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                allowSave
              />
            </>
          ) : null}

          {renderQuoted()}

          {/* ACTIONS */}
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

  name: { fontSize: 16, maxWidth: 160, lineHeight: 20 },
  nameDetail: { fontSize: 18 },

  handleInline: {
    fontSize: 15,
    opacity: 0.9,
    flexShrink: 1,
    lineHeight: 20,
  },

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

  menuBtn: { padding: 6, borderRadius: 999, alignSelf: "flex-start" },

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

  replyingInline: { marginTop: 0 },
  replyingText: { fontSize: 13, lineHeight: 17 },

  text: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  textReply: { marginTop: 0 },
  textDetail: { fontSize: 18, lineHeight: 20, marginTop: 10 },

  dateLine: { marginTop: 12, fontSize: 13 },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },

  countsRow: { flexDirection: "row", gap: 16 },
  countItem: { fontSize: 14 },

  quoteCard: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },

  quoteInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },

  quoteAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 999,
    marginTop: 2,
  },

  quoteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
});
