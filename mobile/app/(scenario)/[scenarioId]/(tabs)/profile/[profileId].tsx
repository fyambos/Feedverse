// mobile/app/(scenario)/[scenarioId]/(tabs)/profile/[profileId].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { Lightbox } from "@/components/media/LightBox";

import { canEditProfile } from "@/lib/permission";

import { ProfileHeaderMedia } from "@/components/profile/ProfileHeaderMedia";
import { ProfileAvatarRow } from "@/components/profile/ProfileAvatarRow";
import { ProfileBioBlock } from "@/components/profile/ProfileBioBlock";
import { ProfileTabsBar } from "@/components/profile/ProfileTabsBar";
import { ProfilePostsList } from "@/components/profile/ProfilePostsList";
import { ProfileStatusOverlay } from "@/components/profile/ProfileStatusOverlay";
import type { ProfileOverlayConfig } from "@/components/profile/profileTypes";

type Cursor = string | null;
const PAGE_SIZE = 10;

export default function ProfileScreen() {
  const { scenarioId, profileId } = useLocalSearchParams<{ scenarioId: string; profileId: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const {
    isReady,
    getProfileById,
    listPostsPage,
    deletePost,
    upsertProfile,
    getSelectedProfileId,
  } = useAppData();

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const pid = decodeURIComponent(String(profileId ?? ""));

  const profile = useMemo(() => getProfileById(String(pid)), [pid, getProfileById]);

  const selectedId = getSelectedProfileId(sid);
  const isCurrentSelected = !!profile && !!selectedId && String(selectedId) === String(profile.id);

  const canModifyProfile = canEditProfile({
    profile,
    userId,
    selectedProfileId: selectedId ? String(selectedId) : null,
  });

  const [editMode, setEditMode] = useState(false);
  useEffect(() => {
    setEditMode(!!isCurrentSelected);
  }, [isCurrentSelected]);

  const showCameras = editMode;

  // -------- picker lock
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

  // -------- lightbox
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

  // -------- posts paging
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const loadingLock = useRef(false);

  const loadFirstPage = useCallback(() => {
    if (!isReady || !profile) return;

    const page = listPostsPage({
      scenarioId: sid,
      limit: PAGE_SIZE,
      cursor: null,
      filter: (p) => String(p.authorProfileId) === String(profile.id),
      includeReplies: false,
    });

    setItems(page.items);
    setCursor(page.nextCursor);
    setHasMore(!!page.nextCursor);
    setInitialLoading(false);
  }, [isReady, profile, listPostsPage, sid]);

  const loadMore = useCallback(() => {
    if (!isReady || !profile) return;
    if (!hasMore) return;
    if (loadingLock.current) return;

    loadingLock.current = true;
    setLoadingMore(true);

    try {
      const page = listPostsPage({
        scenarioId: sid,
        limit: PAGE_SIZE,
        cursor,
        filter: (p) => String(p.authorProfileId) === String(profile.id),
        includeReplies: false,
      });

      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } finally {
      setLoadingMore(false);
      loadingLock.current = false;
    }
  }, [isReady, profile, hasMore, listPostsPage, sid, cursor]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);

    if (isReady && profile) loadFirstPage();
  }, [isReady, profile, sid, loadFirstPage]);

  // keep delete confirm here (so ProfilePostsList stays dumb)
  const onDeletePost = useCallback(
    async (postId: string) => {
      return new Promise<void>((resolve) => {
        Alert.alert("Delete post?", "This will remove the post.", [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              await deletePost(postId);
              loadFirstPage();
              resolve();
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

    Alert.alert("Not yet", "Follow logic later.");
  }, [profile, editMode, canModifyProfile, denyModify, sid]);

  const onLongPressPrimary = useCallback(() => setEditMode((v) => !v), []);

  // -------- moderation/profile states (placeholder for later)
  // When you implement: compute this based on viewer/profile relations and show overlay and/or change empty state.
  const overlay: ProfileOverlayConfig | null = null;
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    setOverlayOpen(!!overlay);
  }, [overlay]);

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

  if (!profile) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={{ padding: 16 }}>
          <ThemedText style={{ color: colors.textSecondary }}>
            Profile not found for id {pid}.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

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
      />

      <ProfileBioBlock colors={colors as any} profile={profile} />
      <ProfileTabsBar colors={colors as any} />
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <ProfilePostsList
          colors={colors as any}
          sid={sid}
          items={items}
          initialLoading={initialLoading}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          getProfileById={getProfileById as any}
          userId={userId ?? null}
          onDeletePost={onDeletePost}
          ListHeaderComponent={headerEl}
        />

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
});
