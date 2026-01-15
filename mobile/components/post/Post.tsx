// mobile/components/post/Post.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AntDesign from "@expo/vector-icons/AntDesign";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import type { Post as DbPost, Profile } from "@/data/db/schema";
import type { PostType } from "@/lib/campaign/postTypes";

import { Avatar } from "@/components/ui/Avatar";
import { formatCount, formatDetailTimestamp } from "@/lib/format";

import { PostActions } from "@/components/post/PostActions";
import { PostHeader } from "@/components/post/PostHeader";
import { PostBody } from "@/components/post/PostBody";
import { PostQuoted } from "@/components/post/PostQuoted";

import { useUserSettings } from "@/hooks/useUserSettings";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

import { PostTypeBadge } from "@/components/post/PostTypeBadge";
import { PostMenu } from "@/components/post/PostMenu";

export type PostVariant = "feed" | "detail" | "reply";

type Props = {
  scenarioId: string;
  profile: Profile;
  item: DbPost;
  refreshTick?: number;
  variant?: PostVariant;
  replyingTo?: string;
  showActions?: boolean;
  showThreadLine?: boolean;

  showMenu?: boolean;
  isInteractive?: boolean;
  showQuoted?: boolean;

  // likes
  isLiked?: boolean;
  onLike?: () => void;

  // reposts
  isReposted?: boolean;
  onRepost?: () => void | Promise<void>;

  // share
  onShare?: () => void;

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

function isCampaignPostType(t: any): t is PostType {
  return t === "rp" || t === "roll" || t === "log" || t === "quest" || t === "combat" || t === "gm";
}

export function Post({
  scenarioId,
  profile,
  item,
  refreshTick,
  variant = "feed",
  replyingTo,
  showActions = true,
  showThreadLine = false,

  showMenu = true,
  isInteractive = true,
  showQuoted = true,

  isLiked = false,
  onLike,
  isReposted = false,
  onRepost,

  onShare,

  repostedByLabel = null,
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { showTimestamps } = useUserSettings();
  const showTimestampsPref = showTimestamps;

  const addVideoIcon = Boolean((item as any).addVideoIcon);

  const isDetail = variant === "detail";
  const isReply = variant === "reply" || (!!item.parentPostId && variant !== "detail");

  const { scenarioId: scenarioIdParam } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? item.scenarioId ?? scenarioIdParam ?? "");

  const canOpenMenu = Boolean(showMenu && isInteractive);
  const canNavigate = Boolean(isInteractive);

  const postType = (item as any).postType as PostType | undefined;

  const appData = useAppData() as any;
  const { getSelectedProfileId, getCharacterSheetByProfileId, upsertCharacterSheet, upsertPost, toggleLike } = appData;

  const { userId, currentUser } = useAuth();
  const currentUserId: string | null = userId ?? currentUser?.id ?? null;

  // Try to get the scenario object (supports different appData shapes)
  const scenario =
    typeof appData.getScenarioById === "function"
      ? appData.getScenarioById(sid)
      : appData.scenarios?.[sid] ?? appData.scenarioById?.[sid] ?? null;

  const isCampaignMode = String((scenario as any)?.mode ?? "story") === "campaign";

  // Only the scenario owner or listed GMs can use GM tools
  const isGmUser = Boolean(
    currentUserId &&
      scenario &&
      (scenario.ownerUserId === currentUserId ||
        (Array.isArray(scenario.gmUserIds) && scenario.gmUserIds.includes(currentUserId)))
  );

  const gmProfileId = sid ? getSelectedProfileId(sid) : null;

  const isCampaignPost = isCampaignMode && isCampaignPostType(postType);
  // GM tools should only be available to actual GMs in campaign mode.
  const canUseGmMenu = Boolean(isCampaignMode && isGmUser);

  const replyCount = item.replyCount ?? 0;
  const repostCount = item.repostCount ?? 0;
  const likeCount = item.likeCount ?? 0;

  const hasDetailCounts = isDetail && (repostCount > 0 || likeCount > 0);

  // menu state
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleOpenMenu = () => {
    if (!canOpenMenu) return;
    setMenuOpen(true);
  };

  const onReportPost = () => {
    // placeholder
  };

  function openProfile(view?: ProfileViewState) {
    if (!canNavigate) return;
    if (!sid || !profile?.id) return;

    const pathname = "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]";
    const params = {
      scenarioId: sid,
      profileId: String(profile.id),
      ...(view ? { view } : {}),
    };

    router.push({ pathname, params } as any);
  }

  const onReply = () => {
    if (!canNavigate) return;
    if (!sid) return;
    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid, parentPostId: String(item.id) },
    } as any);
  };

  const onQuote = () => {
    if (!canNavigate) return;
    if (!sid) return;
    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid, quotedPostId: String(item.id) },
    } as any);
  };

  // ===== DETAIL =====
  if (isDetail) {
    return (
      <View style={styles.wrap}>
        <PostHeader
          variant="detail"
          colors={colors}
          scenarioId={sid}
          profile={profile}
          createdAtIso={item.createdAt}
          refreshTick={refreshTick}
          onOpenProfile={() => openProfile()}
          onOpenMenu={handleOpenMenu}
          showMenu={showMenu}
          isInteractive={isInteractive}
          showTimestamps={showTimestampsPref}
        />

        <PostMenu
          visible={menuOpen && canOpenMenu}
          onClose={() => setMenuOpen(false)}
          colors={colors as any}
          isCampaign={canUseGmMenu}
          profile={profile}
          item={item}
          onReportPost={onReportPost}
          onOpenProfile={(view) => openProfile(view)}
          scenarioId={canUseGmMenu ? sid : undefined}
          gmProfileId={canUseGmMenu ? gmProfileId ?? undefined : undefined}
          getSheet={canUseGmMenu ? getCharacterSheetByProfileId : undefined}
          updateSheet={canUseGmMenu ? (profileId, next) => upsertCharacterSheet({ ...next, profileId }) : undefined}
          createGmPost={
            canUseGmMenu
              ? ({ scenarioId, text, authorProfileId }) => {
                  const now = new Date().toISOString();
                  upsertPost({
                    id: `gm_${Date.now()}`,
                    scenarioId: String(scenarioId),
                    authorProfileId: String(authorProfileId),
                    text,
                    createdAt: now,
                    insertedAt: now,
                    postType: "gm",
                  } as any);
                }
              : undefined
          }
        />

        <PostBody
          sid={sid}
          variant="detail"
          colors={colors}
          item={item}
          addVideoIcon={addVideoIcon}
        />

        {showQuoted ? (
          <PostQuoted sid={sid} isDetail={isDetail} quotedPostId={item.quotedPostId} colors={colors as any} />
        ) : null}

        {showTimestampsPref ? (
          <ThemedText style={[styles.dateLine, { color: colors.textSecondary }]}>{formatDetailTimestamp(item.createdAt)}</ThemedText>
        ) : null}

        {hasDetailCounts && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.countsRow}>
              {repostCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(repostCount)}</ThemedText> {pluralize(repostCount, "Repost")}
                </ThemedText>
              )}
              {likeCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(likeCount)}</ThemedText> {pluralize(likeCount, "Like")}
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
            onLike={() => {
              if (onLike) return onLike();
              void toggleLike?.(String(sid), String(item.id));
            }}
            isReposted={isReposted}
            onRepost={onRepost}
            onShare={onShare}
          />
        )}
      </View>
    );
  }

  // ===== FEED / REPLY =====
  const replyingToHandle = replyingTo ? replyingTo : "";

  return (
    <View style={styles.wrapReply}>
      {repostedByLabel ? (
        <View style={styles.repostBanner}>
          <AntDesign name="retweet" size={14} color={colors.tint} />
          <ThemedText style={[styles.repostBannerText, { color: colors.textSecondary }]}>{repostedByLabel}</ThemedText>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.avatarCol}>
          {showThreadLine ? <View style={[styles.threadLine, { backgroundColor: colors.border }]} /> : null}

          <Pressable onPress={() => openProfile()} style={styles.avatarPress} disabled={!canNavigate}>
            <Avatar uri={profile.avatarUrl} size={44} fallbackColor={colors.border} />
          </Pressable>

          {/* post type under avatar (campaign only, hide "rp") */}
          {isCampaignPost && postType && postType !== "rp" ? (
            <View style={styles.avatarBadge}>
              <PostTypeBadge colors={colors as any} type={postType} compact />
            </View>
          ) : null}
        </View>

        <View style={styles.rightCol}>
          <PostHeader
            variant={isReply ? "reply" : "feed"}
            colors={colors}
            scenarioId={sid}
            profile={profile}
            createdAtIso={item.createdAt}
            refreshTick={refreshTick}
            isReply={isReply}
            replyingToHandle={replyingToHandle}
            onOpenProfile={() => openProfile()}
            onOpenMenu={handleOpenMenu}
            showMenu={showMenu}
            isInteractive={isInteractive}
            showTimestamps={showTimestampsPref}
          />

          <PostMenu
            visible={menuOpen && canOpenMenu}
            onClose={() => setMenuOpen(false)}
            colors={colors as any}
            isCampaign={canUseGmMenu}
            profile={profile}
            item={item}
            onReportPost={onReportPost}
            onOpenProfile={(view) => openProfile(view)}
            scenarioId={canUseGmMenu ? sid : undefined}
            gmProfileId={canUseGmMenu ? gmProfileId ?? undefined : undefined}
            getSheet={canUseGmMenu ? getCharacterSheetByProfileId : undefined}
            updateSheet={canUseGmMenu ? (profileId, next) => upsertCharacterSheet({ ...next, profileId }) : undefined}
            createGmPost={
              canUseGmMenu
                ? ({ scenarioId, text, authorProfileId }) => {
                    const now = new Date().toISOString();
                    upsertPost({
                      id: `gm_${Date.now()}`,
                      scenarioId: String(scenarioId),
                      authorProfileId: String(authorProfileId),
                      text,
                      createdAt: now,
                      insertedAt: now,
                      postType: "gm",
                    } as any);
                  }
                : undefined
            }
          />

          <PostBody
            sid={sid}
            variant={isReply ? "reply" : "feed"}
            colors={colors}
            item={item}
            isReply={isReply}
            addVideoIcon={addVideoIcon}
          />

          {showQuoted ? (
            <PostQuoted sid={sid} isDetail={false} quotedPostId={item.quotedPostId} colors={colors as any} />
          ) : null}

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
              onLike={() => {
                if (onLike) return onLike();
                void toggleLike?.(String(sid), String(item.id));
              }}
              isReposted={isReposted}
              onRepost={onRepost}
              onShare={onShare}
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
    paddingLeft: 44 + 12,
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

  avatarCol: { width: 44, alignItems: "center", position: "relative", alignSelf: "stretch" },
  threadLine: {
    position: "absolute",
    top: 50,
    bottom: 0,
    width: 2,
    borderRadius: 4,
    opacity: 0.85,
  },

  avatarBadge: {
    marginTop: 6,
    alignItems: "center",
  },
});