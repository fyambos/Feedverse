// mobile/app/(scenario)/[scenarioId]/profile/[profileId].tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { Alert } from "@/context/dialog";

import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { Lightbox } from "@/components/media/LightBox";

import { canEditProfile } from "@/lib/permission";

import { ProfileHeaderMedia } from "@/components/profile/ProfileHeaderMedia";
import { ProfileAvatarRow } from "@/components/profile/ProfileAvatarRow";
import { ProfileBioBlock } from "@/components/profile/ProfileBioBlock";
import { ProfileTabsBar, type ProfileTab } from "@/components/profile/ProfileTabsBar";
import { ProfilePostsList } from "@/components/profile/ProfilePostsList";
import { ProfileStatusOverlay } from "@/components/profile/ProfileStatusOverlay";
import { CreatePostFab } from "@/components/post/CreatePostFab";
import { Post as PostCard } from "@/components/post/Post";
import type { ProfileOverlayConfig, ProfileViewState } from "@/components/profile/profileTypes";
import { formatErrorMessage } from "@/lib/format";

type Cursor = string | null;
const PAGE_SIZE = 10;

function BigMessage({
  colors,
  title,
  body,
}: {
  colors: { text: string; textSecondary: string };
  title: string;
  body: string;
}) {
  return (
    <View style={styles.bigWrap}>
      <ThemedText style={[styles.bigTitle, { color: colors.text }]}>{title}</ThemedText>
      <ThemedText style={[styles.bigBody, { color: colors.textSecondary }]}>{body}</ThemedText>
    </View>
  );
}

export default function ProfileScreen() {
  const { scenarioId, profileId, view, startDm } = useLocalSearchParams<{
    scenarioId: string;
    profileId: string;
    view?: ProfileViewState;
    startDm?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const {
    isReady,
    getProfileById,
    deletePost,
    upsertProfile,
    getSelectedProfileId,
    getPostById,
    getPinnedPostIdForProfile,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,

    listProfileFeedPage,
    isPostRepostedByProfileId,

    getScenarioById,
    getCharacterSheetByProfileId,
    getOrCreateConversation,
  } = useAppData() as any;

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const pid = decodeURIComponent(String(profileId ?? ""));

  const deletePostRef = useRef(false);

  const profile = useMemo(() => getProfileById(String(pid)), [pid, getProfileById]);

  const scenario = useMemo(() => getScenarioById?.(sid) ?? null, [sid, getScenarioById]);
  const isCampaign = String((scenario as any)?.mode ?? "story") === "campaign";

  // compute once; reuse everywhere (prevents stale/undefined inline calls)
  const selectedProfileId = useMemo(() => {
    try {
      return getSelectedProfileId?.(sid) ?? null;
    } catch {
      return null;
    }
  }, [getSelectedProfileId, sid]);

  const isOwnerOfProfile = useMemo(() => {
    if (!profile || !userId) return false;
    return String((profile as any).ownerUserId ?? "") === String(userId);
  }, [profile, userId]);

  const isGm = useMemo(() => {
    if (!scenario || !userId) return false;
    const gmIds: string[] = Array.isArray((scenario as any).gmUserIds)
      ? (scenario as any).gmUserIds.map(String)
      : [];
    return gmIds.includes(String(userId));
  }, [scenario, userId]);

  const sheetExists = useMemo(() => {
    if (!profile) return false;
    return !!getCharacterSheetByProfileId?.(String(profile.id));
  }, [profile, getCharacterSheetByProfileId]);

  const pinnedPostId = useMemo(() => {
    try {
      return getPinnedPostIdForProfile?.(String(pid)) ?? null;
    } catch {
      return null;
    }
  }, [getPinnedPostIdForProfile, pid]);

  const pinnedPost = useMemo(() => {
    if (!pinnedPostId) return null;
    try {
      return getPostById?.(String(pinnedPostId)) ?? null;
    } catch {
      return null;
    }
  }, [getPostById, pinnedPostId]);

  const pinnedAuthorProfile = useMemo(() => {
    try {
      const authorId = pinnedPost ? String((pinnedPost as any).authorProfileId ?? "").trim() : "";
      if (!authorId) return null;
      return getProfileById?.(authorId) ?? null;
    } catch {
      return null;
    }
  }, [getProfileById, pinnedPost]);

  const pinnedReplyingTo = useMemo(() => {
    try {
      if (!pinnedPost?.parentPostId) return "";
      const parent = getPostById?.(String(pinnedPost.parentPostId)) ?? null;
      if (!parent) return "";
      const p = getProfileById?.(String((parent as any).authorProfileId)) ?? null;
      return p?.handle ?? "";
    } catch {
      return "";
    }
  }, [getPostById, getProfileById, pinnedPost]);

  const isCurrentSelected =
    !!profile && !!selectedProfileId && String(selectedProfileId) === String(profile.id);

  const canModifyProfile = canEditProfile({
    profile,
    userId,
    selectedProfileId: selectedProfileId ? String(selectedProfileId) : null,
  });

  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [isFollowing, setIsFollowing] = useState(false);

  const [editMode, setEditMode] = useState(false);
  useEffect(() => setEditMode(!!isCurrentSelected), [isCurrentSelected]);

  const showCameras = editMode;

  const [picking, setPicking] = useState(false);
  const withPickerLock = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      if (picking) return null as any;
      setPicking(true);
      try {
        return await fn();
      } finally {
        setPicking(false);
      }
    },
    [picking]
  );

  const denyModify = useCallback(() => {
    Alert.alert("Not allowed", "You can't modify this profile.");
  }, []);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = useCallback((urls: Array<string | null | undefined>, initialIndex = 0) => {
    const clean = urls.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (clean.length === 0) return;
    setLightboxUrls(clean);
    setLightboxIndex(Math.max(0, Math.min(initialIndex, clean.length - 1)));
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setLightboxUrls([]);
    setLightboxIndex(0);
  }, []);

  const avatarUri = profile?.avatarUrl ?? null;
  const headerUri = profile?.headerUrl ?? null;

  const onChangeAvatar = useCallback(async () => {
    if (!profile) return;
    if (!canModifyProfile) return denyModify();

    const uri = await withPickerLock(() =>
      pickAndPersistOneImage({ persistAs: "avatar", allowsEditing: true, quality: 0.9 })
    );
    if (!uri) return;

    await upsertProfile({ ...profile, avatarUrl: uri });
  }, [profile, canModifyProfile, denyModify, upsertProfile, withPickerLock]);

  const onChangeHeader = useCallback(async () => {
    if (!profile) return;
    if (!canModifyProfile) return denyModify();

    const uri = await withPickerLock(() =>
      pickAndPersistOneImage({ persistAs: "header", allowsEditing: true, quality: 0.9 })
    );
    if (!uri) return;

    await upsertProfile({ ...profile, headerUrl: uri });
  }, [profile, canModifyProfile, denyModify, upsertProfile, withPickerLock]);

  const viewState: ProfileViewState = (view as ProfileViewState) ?? "normal";

  const isBlockedBy = viewState === "blocked_by";
  const isBlocked = viewState === "blocked";
  const isSuspended = viewState === "suspended";
  const isPrivated = viewState === "privated";
  const isDeactivated = viewState === "deactivated";
  const isReactivated = viewState === "reactivated";
  const isMuted = viewState === "muted";

  const startDmRanRef = useRef(false);

  const startDmWithProfile = useCallback(async () => {
    if (!sid) return;
    if (!profile) return;

    const me = String(selectedProfileId ?? "").trim();
    if (!me) {
      const dest = `/(scenario)/${encodeURIComponent(sid)}/(tabs)/home/profile/${encodeURIComponent(
        String(profile.id)
      )}?startDm=1`;

      router.push({
        pathname: "/modal/select-profile",
        params: { scenarioId: sid, returnTo: dest, replace: "1" },
      } as any);
      return;
    }

    const other = String(profile.id);
    const participantProfileIds = [me, other];
    const res = await getOrCreateConversation?.({ scenarioId: sid, participantProfileIds });
    if (!res?.ok) {
      Alert.alert("Could not create DM", res?.error || "Unknown error");
      return;
    }

    const conversationId = String(res.conversationId);
    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/messages",
      params: { scenarioId: sid, openConversationId: conversationId },
    } as any);
  }, [getOrCreateConversation, profile, selectedProfileId, sid]);

  useEffect(() => {
    if (startDmRanRef.current) return;
    if (String(startDm ?? "") !== "1") return;
    if (!selectedProfileId) return;

    startDmRanRef.current = true;
    router.setParams({ startDm: undefined } as any);
    startDmWithProfile();
  }, [selectedProfileId, startDm, startDmWithProfile]);

  const showTabs = viewState === "normal" || viewState === "muted";

  const [mutedModalOpen, setMutedModalOpen] = useState(false);
  useEffect(() => {
    setMutedModalOpen(viewState === "muted");
  }, [viewState]);

  const [overlay, setOverlay] = useState<ProfileOverlayConfig | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    setOverlayOpen(!!overlay);
  }, [overlay]);

  const at = useMemo(() => {
    const h = profile?.handle ? String(profile.handle) : "";
    if (!h) return "@";
    return h.startsWith("@") ? h : `@${h}`;
  }, [profile?.handle]);

  const stateMessage = useMemo(() => {
    if (isBlockedBy) {
      return {
        title: `${at} has blocked you`,
        body:
          `You are blocked from engaging with ${at}, you cannot view public posts from them.` +
          `You also cannot follow or message ${at}.`,
      };
    }
    if (isBlocked) {
      return {
        title: `You blocked ${at}`,
        body: `They cannot see posts from you or interact with your account.`,
      };
    }
    if (isSuspended) {
      return {
        title: "Account suspended",
        body: "This account has violated the rules and is currently suspended.",
      };
    }
    if (isPrivated) {
      return {
        title: "These posts are protected",
        body: "Only approved followers can see this account’s posts.",
      };
    }
    return null;
  }, [isBlockedBy, isBlocked, isSuspended, isPrivated, at]);

  const shouldHidePostsAndShowMessage = isBlockedBy || isBlocked || isSuspended || isPrivated;
  const canShowMessageButton = !shouldHidePostsAndShowMessage && !isDeactivated;

  const repostLabelForPost = useCallback(
    (postAuthorProfileId: string, postId: string) => {
      if (!profile) return null;

      const authoredByProfile = String(postAuthorProfileId) === String(profile.id);
      if (authoredByProfile) return null;

      const repostedByViewing = isPostRepostedByProfileId
        ? isPostRepostedByProfileId(String(profile.id), String(postId))
        : false;

      if (!repostedByViewing) return null;

      if (isCurrentSelected) return "reposted by you";
      return `reposted by ${profile.displayName}`;
    },
    [profile, isCurrentSelected, isPostRepostedByProfileId]
  );

  const emptyText =
    activeTab === "media"
      ? "No media yet."
      : activeTab === "replies"
      ? "No replies yet."
      : activeTab === "likes"
      ? "No likes yet."
      : "No posts yet.";

  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const loadingLock = useRef(false);
  const loadFirstPageRef = useRef<null | (() => void)>(null);
  const profileIdForFeed = profile ? String(profile.id) : null;

  const visibleItems = useMemo(() => {
    if (!pinnedPostId) return items;
    const pinId = String(pinnedPostId);
    return items.filter((it: any) => String(it?.id) !== pinId);
  }, [items, pinnedPostId]);

  const loadFirstPage = useCallback(() => {
    if (!isReady || !profileIdForFeed) return;

    const page = listProfileFeedPage({
      scenarioId: sid,
      profileId: profileIdForFeed,
      tab: activeTab,
      limit: PAGE_SIZE,
      cursor: null,
    });

    setItems(page.items.map((it: any) => it.post));
    setCursor(page.nextCursor);
    setHasMore(!!page.nextCursor);
    setInitialLoading(false);
  }, [isReady, profileIdForFeed, listProfileFeedPage, sid, activeTab]);

  const loadMore = useCallback(() => {
    if (!isReady || !profileIdForFeed) return;
    if (!hasMore) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setLoadingMore(true);

    try {
      const page = listProfileFeedPage({
        scenarioId: sid,
        profileId: profileIdForFeed,
        tab: activeTab,
        limit: PAGE_SIZE,
        cursor,
      });

      const nextPosts = page.items.map((it: any) => it.post);
      setItems((prev) => {
        const seen = new Set(prev.map((p: any) => String(p?.id)));
        const deduped = nextPosts.filter((p: any) => !seen.has(String(p?.id)));
        return [...prev, ...deduped];
      });
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor && page.nextCursor !== cursor);
    } finally {
      setLoadingMore(false);
      loadingLock.current = false;
    }
  }, [isReady, profileIdForFeed, hasMore, listProfileFeedPage, sid, cursor, activeTab]);

  useEffect(() => {
    loadFirstPageRef.current = loadFirstPage;
  }, [loadFirstPage]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);

    if (isReady && profileIdForFeed) loadFirstPageRef.current?.();
  }, [isReady, profileIdForFeed, sid, activeTab]);

  const onDeletePost = useCallback(
    async (postId: string) => {
      return new Promise<void>((resolve) => {
        Alert.alert("Delete post?", "This will remove the post.", [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (deletePostRef.current) return resolve();
              deletePostRef.current = true;
              try {
                await deletePost(postId);
                loadFirstPage();
              } catch (e: any) {
                Alert.alert("Could not delete", formatErrorMessage(e, "Could not delete post"));
              } finally {
                deletePostRef.current = false;
                resolve();
              }
            },
          },
        ]);
      });
    },
    [deletePost, loadFirstPage]
  );

  const onPressPrimary = useCallback(() => {
    if (!profile) return;

    if (editMode) {
      if (!canModifyProfile) return denyModify();

      router.push({
        pathname: "/modal/create-profile",
        params: { scenarioId: sid, mode: "edit", profileId: profile.id },
      } as any);
      return;
    }

    setIsFollowing((v) => !v);
  }, [profile, editMode, canModifyProfile, denyModify, sid]);

  const onLongPressPrimary = useCallback(() => setEditMode((v) => !v), []);
  const openCharacterSheet = useCallback(() => {
    if (!profile) return;
    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/home/sheet/[profileId]",
      params: { scenarioId: sid, profileId: String(profile.id) },
    } as any);
  }, [profile, sid]);

  // - if no selected profile, send them to select-profile (forced)
  // - else open create-post
  const openCreatePost = useCallback(() => {
    if (!sid) return;

    const selected = selectedProfileId;

    if (!selected) {
      router.push({
        pathname: "/modal/select-profile",
        params: { scenarioId: sid, forced: "1" },
      } as any);
      return;
    }

    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid },
    } as any);
  }, [sid, selectedProfileId]);

  if (!isReady) {
    return (
      <ThemedView
        style={[
          styles.screen,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (isDeactivated) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.deactivatedHeader, { backgroundColor: colors.border }]} />
        <View style={styles.deactivatedAvatarRow}>
          <View style={[styles.deactivatedAvatarOuter, { backgroundColor: colors.background }]}>
            <View style={[styles.deactivatedAvatarInner, { backgroundColor: colors.border }]} />
          </View>
        </View>
        <View style={styles.deactivatedBody}>
          <ThemedText style={[styles.bigTitle, { color: colors.text }]}>This account doesn’t exist</ThemedText>
          <ThemedText style={[styles.bigBody, { color: colors.textSecondary }]}>Try searching for another.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={{ padding: 16 }}>
          <ThemedText style={{ color: colors.textSecondary }}>Profile not found for id {pid}.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const forcedStats = isReactivated ? { following: 0, followers: 0 } : undefined;

  const headerEl = (
    <View style={overlay?.dimUnderlying ? { opacity: 0.45 } : undefined}>
      <ProfileHeaderMedia
        colors={colors as any}
        headerUri={headerUri}
        showCameras={showCameras}
        picking={picking}
        onOpenLightbox={() => openLightbox([headerUri], 0)}
        onChangeHeader={onChangeHeader}
      />

      <ProfileAvatarRow
        colors={colors as any}
        avatarUri={avatarUri}
        showCameras={showCameras}
        picking={picking}
        onOpenAvatarLightbox={() => openLightbox([avatarUri], 0)}
        onChangeAvatar={onChangeAvatar}
        editMode={editMode}
        onPressPrimary={onPressPrimary}
        onLongPressPrimary={onLongPressPrimary}
        secondaryButton={
          !editMode && canShowMessageButton
            ? {
                icon: "mail-outline",
                onPress: startDmWithProfile,
                accessibilityLabel: "Message",
              }
            : undefined
        }
        primaryButtonOverride={
          isBlocked
            ? { label: "Blocked", variant: "danger" }
            : !editMode
            ? { label: isFollowing ? "Following" : "Follow", variant: isFollowing ? "ghost" : "primary" }
            : undefined
        }
      />

      <ProfileBioBlock
        colors={colors as any}
        profile={profile}
        viewState={viewState}
        forceStats={forcedStats}
        showLockOnName={(isPrivated && profile.isPrivate !== true) || profile.isPrivate === true}
        showStats={viewState === "normal" || viewState === "muted" || viewState === "reactivated"}
        showCharacterSheetButton={isCampaign}
        onPressCharacterSheet={openCharacterSheet}
      />

      {showTabs ? (
        <ProfileTabsBar
          colors={colors as any}
          activeTab={activeTab}
          onChangeTab={(t: ProfileTab) => {
            if (t === activeTab) return;
            setActiveTab(t);
          }}
        />
      ) : null}

      {activeTab === "posts" && pinnedPostId ? (
        <View style={[styles.pinnedWrap, { borderColor: colors.border }]}>
          {pinnedPost ? (
            <Pressable
              onPress={() => {
                router.push({
                  pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
                  params: {
                    scenarioId: sid,
                    postId: String((pinnedPost as any).id),
                    from: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
                    profileId: String(pid),
                  },
                } as any);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: pressed ? colors.pressed : colors.background,
                  borderRadius: 12,
                  overflow: "hidden",
                },
              ]}
            >
              <PostCard
                scenarioId={sid}
                profile={(pinnedAuthorProfile ?? profile) as any}
                item={pinnedPost as any}
                variant={(pinnedPost as any)?.parentPostId ? "reply" : "feed"}
                replyingTo={pinnedReplyingTo}
                pinnedLabel="Pinned"
                showActions
                isLiked={isPostLikedBySelectedProfile(sid, String((pinnedPost as any).id))}
                onLike={() => toggleLike(sid, String((pinnedPost as any).id))}
                isReposted={isPostRepostedBySelectedProfile(sid, String((pinnedPost as any).id))}
                onRepost={() => toggleRepost(sid, String((pinnedPost as any).id))}
              />
            </Pressable>
          ) : (
            <View style={[styles.pinnedMissing, { backgroundColor: colors.pressed, borderColor: colors.border }]}>
              <ThemedText style={{ color: colors.textSecondary, fontWeight: "700" }}>
                Pinned post not loaded yet.
              </ThemedText>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );

  // SHOW FAB when:
  // - normal/muted
  // - not blocked/privated/etc
  // - AND (a selected profile exists OR you’re on your own profile)
  const canShowFab =
    (viewState === "normal" || viewState === "muted") &&
    !shouldHidePostsAndShowMessage &&
    (!!selectedProfileId || isOwnerOfProfile);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View pointerEvents="box-none" style={styles.fabLayer}>
          {canShowFab ? (
            <CreatePostFab scenarioId={sid} colors={colors as any} onPress={openCreatePost} />
          ) : null}
        </View>

        {shouldHidePostsAndShowMessage ? (
          <View>
            {headerEl}
            <BigMessage
              colors={{ text: colors.text, textSecondary: colors.textSecondary }}
              title={stateMessage?.title ?? ""}
              body={stateMessage?.body ?? ""}
            />
          </View>
        ) : isReactivated ? (
          <View>
            {headerEl}
            <View style={{ paddingVertical: 28, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          </View>
        ) : (
          <ProfilePostsList
            colors={colors as any}
            sid={sid}
            viewingProfileId={pid}
            items={visibleItems}
            initialLoading={initialLoading}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            getProfileById={getProfileById as any}
            getPostById={getPostById as any}
            userId={userId ?? null}
            onDeletePost={onDeletePost}
            ListHeaderComponent={headerEl}
            emptyText={emptyText}
            getIsLiked={(postId: string) => isPostLikedBySelectedProfile(sid, String(postId))}
            onLikePost={(postId: string) => toggleLike(sid, String(postId))}
            getIsReposted={(postId: string) => isPostRepostedBySelectedProfile(sid, String(postId))}
            onRepostPost={(postId: string) => toggleRepost(sid, String(postId))}
            repostLabelForPost={(postAuthorProfileId: string, postId: string) =>
              repostLabelForPost(postAuthorProfileId, postId)
            }
          />
        )}

        {isMuted ? (
          <ProfileStatusOverlay
            visible={mutedModalOpen}
            colors={colors as any}
            title="Account muted"
            message={`You’ve muted ${at}.`}
            onClose={() => {
              setMutedModalOpen(false);
              router.setParams({ view: "normal" } as any);
            }}
          />
        ) : null}

        {picking && (
          <View style={styles.pickerOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        <Lightbox
          urls={lightboxUrls}
          initialIndex={lightboxIndex}
          visible={lightboxOpen}
          onClose={closeLightbox}
          title={profile.displayName}
          allowSave
        />

        {overlay ? (
          <ProfileStatusOverlay
            visible={overlayOpen}
            colors={colors as any}
            title={overlay.title}
            message={overlay.message}
            onClose={() => setOverlayOpen(false)}
          />
        ) : null}
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },

  bigWrap: { paddingTop: 22, paddingHorizontal: 16, paddingBottom: 18 },
  bigTitle: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.4 },
  bigBody: { marginTop: 12, fontSize: 15, lineHeight: 20, opacity: 0.92 },

  deactivatedHeader: { height: 140, opacity: 0.15 },
  deactivatedAvatarRow: {
    marginTop: -26,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  deactivatedAvatarOuter: { width: 88, height: 88, borderRadius: 999, padding: 4 },
  deactivatedAvatarInner: { width: 80, height: 80, borderRadius: 999, opacity: 0.35 },
  deactivatedBody: { paddingTop: 22, paddingHorizontal: 16 },

  fabLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    pointerEvents: "box-none",
  },

  pinnedWrap: {
    marginTop: 10,
    marginHorizontal: 12,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  pinnedMissing: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});