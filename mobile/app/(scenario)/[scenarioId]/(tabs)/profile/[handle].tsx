// mobile/app/(scenario)/[scenarioId]/(tabs)/profile/[handle].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import type { Profile, Post } from "@/data/db/schema";

import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { Avatar } from "@/components/ui/Avatar";
import { pickAndPersistOneImage } from "@/components/ui/AvatarPicker";
import { formatCount, formatJoined, normalizeHandle } from "@/lib/format";

import { Lightbox } from "@/components/media/lightBox";

/* -------------------------------------------------------------------------- */
/* Swipe helpers                                                              */
/* -------------------------------------------------------------------------- */

function SwipeActions({
  dragX,
  colors,
  onEdit,
  onDelete,
}: {
  dragX: any;
  colors: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ACTIONS_WIDTH = 120;

  const animStyle = useAnimatedStyle(() => {
    const tx = interpolate(dragX.value, [-ACTIONS_WIDTH, 0], [0, ACTIONS_WIDTH]);
    return { transform: [{ translateX: tx }] };
  });

  const pressedBg = colors.pressed;

  return (
    <Animated.View style={[styles.swipeActions, { width: ACTIONS_WIDTH }, animStyle]}>
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [
          styles.swipeBtn,
          { backgroundColor: pressed ? pressedBg : "transparent", borderColor: colors.tint },
        ]}
        hitSlop={10}
      >
        <Ionicons name="pencil" size={22} color={colors.tint} />
      </Pressable>

      <Pressable
        onPress={onDelete}
        style={({ pressed }) => [
          styles.swipeBtn,
          { backgroundColor: pressed ? pressedBg : "transparent", borderColor: "#F04438" },
        ]}
        hitSlop={10}
      >
        <Ionicons name="trash-outline" size={22} color="#F04438" />
      </Pressable>
    </Animated.View>
  );
}

function SwipeablePostRow({
  sid,
  item,
  colors,
  userId,
  getProfileById,
  onDeletePost,
}: {
  sid: string;
  item: Post;
  colors: any;
  userId: string | null;
  getProfileById: (id: string) => Profile | null;
  onDeletePost: (postId: string) => Promise<void>;
}) {
  const authorProfile = getProfileById(String(item.authorProfileId));
  if (!authorProfile) return null;

  const isOwner = authorProfile.ownerUserId === userId;
  const isPublic = !!authorProfile.isPublic;
  const canEdit = isOwner || isPublic;

  const swipeRef = React.useRef<SwipeableMethods | null>(null);

  const Row = (
    <Pressable
      onPress={() => router.push(`/(scenario)/${sid}/(tabs)/post/${String(item.id)}` as any)}
      style={({ pressed }) => [{ backgroundColor: pressed ? colors.pressed : colors.background }]}
    >
      <PostCard scenarioId={sid} profile={authorProfile} item={item} variant="feed" showActions />
    </Pressable>
  );

  if (!canEdit) return Row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, dragX) => (
        <SwipeActions
          dragX={dragX}
          colors={colors}
          onEdit={() => {
            swipeRef.current?.close();
            router.push({
              pathname: "/modal/create-post",
              params: { scenarioId: sid, mode: "edit", postId: String(item.id) },
            } as any);
          }}
          onDelete={() => {
            swipeRef.current?.close();
            Alert.alert("Delete post?", "This will remove the post.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await onDeletePost(String(item.id));
                },
              },
            ]);
          }}
        />
      )}
    >
      {Row}
    </ReanimatedSwipeable>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function ProfileScreen() {
  const { scenarioId, handle } = useLocalSearchParams<{ scenarioId: string; handle: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const {
    isReady,
    getProfileById,
    getProfileByHandle,
    listPostsForScenario,
    deletePost,
    upsertProfile,
    getSelectedProfileId,
  } = useAppData();

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const wanted = normalizeHandle(decodeURIComponent(String(handle ?? "")));

  const profile = useMemo(() => getProfileByHandle(sid, wanted), [sid, wanted, getProfileByHandle]);

  const selectedId = getSelectedProfileId(sid);

  const isOwner = !!profile && profile.ownerUserId === userId;
  const isPublic = !!profile && !!profile.isPublic;
  const isCurrentSelected = !!profile && !!selectedId && String(selectedId) === String(profile.id);

  // "can modify" means: owned OR public OR currently selected (per your rules)
  const canModifyProfile = isOwner || isPublic || isCurrentSelected;

  // editMode toggles what you SEE:
  // - selected profile starts in editMode (edit btn + cameras)
  // - otherwise starts in followMode (follow btn, no cameras)
  const [editMode, setEditMode] = useState<boolean>(false);

  useEffect(() => {
    // keep it consistent if you navigate between profiles / switch selection
    setEditMode(!!isCurrentSelected);
  }, [isCurrentSelected, sid, wanted]);

  // picker lock overlay
  const [picking, setPicking] = useState(false);

  // ✅ unified lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const avatarUri = profile?.avatarUrl ?? null;
  const headerUri = profile?.headerUrl ?? null;

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

  const denyModify = useCallback(() => {
    Alert.alert("Not allowed", "You can't modify this profile.");
  }, []);

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

  const myPosts = useMemo(() => {
    if (!profile) return [];
    const all = listPostsForScenario(sid);
    return all
      .filter((p) => String(p.authorProfileId) === String(profile.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sid, profile, listPostsForScenario]);

  const onDeletePost = useCallback(
    async (postId: string) => {
      await deletePost(postId);
    },
    [deletePost]
  );

  const onPressPrimary = useCallback(() => {
    if (!profile) return;

    if (editMode) {
      // Edit profile
      if (!canModifyProfile) return denyModify();

      router.push({
        pathname: "/modal/create-profile",
        params: { scenarioId: sid, mode: "edit", profileId: profile.id },
      } as any);
      return;
    }

    // Follow
    Alert.alert("Not yet", "Follow logic later.");
  }, [profile, editMode, canModifyProfile, denyModify, sid]);

  const onLongPressPrimary = useCallback(() => {
    // Toggle mode
    setEditMode((v) => !v);
  }, []);

  const showCameras = editMode; // per your rules, editMode controls camera visibility

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
            Profile not found for {wanted} in scenario {sid}.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <FlatList
          data={myPosts}
          keyExtractor={(p) => String(p.id)}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, opacity: 0.9 }} />
          )}
          contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 24 : 16 }}
          ListHeaderComponent={() => (
            <View>
              {/* HEADER IMAGE */}
              <View style={[styles.headerMediaWrap, { backgroundColor: colors.border }]}>
                {headerUri ? <Image source={{ uri: headerUri }} style={styles.headerMedia} /> : null}

                {/* Tap anywhere to view (if exists) */}
                <Pressable
                  onPress={() => openLightbox([headerUri], 0)}
                  style={StyleSheet.absoluteFill}
                  accessibilityRole="button"
                  accessibilityLabel="View header"
                />

                {/* Back */}
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.backBtn,
                    { backgroundColor: "rgba(0,0,0,0.55)", opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <MaterialIcons name="keyboard-arrow-left" size={24} color="#fff" />
                </Pressable>

                {/* Header controls: only visible in editMode */}
                {showCameras ? (
                  <View style={styles.headerControls}>
                    <Pressable
                      onPress={onChangeHeader}
                      disabled={picking}
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.headerIconBtn,
                        pressed && { opacity: 0.75 },
                        picking && { opacity: 0.5 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Change header"
                    >
                      <Ionicons name="camera" size={16} color="#fff" />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {/* AVATAR ROW */}
              <View style={styles.avatarRow}>
                <View style={[styles.avatarOuter, { backgroundColor: colors.background }]}>
                  <Pressable
                    onPress={() => openLightbox([avatarUri], 0)}
                    onLongPress={showCameras ? onChangeAvatar : undefined}
                    delayLongPress={250}
                  >
                    <Avatar uri={avatarUri} size={80} fallbackColor={colors.border} />
                  </Pressable>

                  {/* Avatar camera: only visible in editMode */}
                  {showCameras ? (
                    <Pressable
                      onPress={onChangeAvatar}
                      disabled={picking}
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.avatarEditBadge,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        pressed && styles.pressedPop,
                        picking && { opacity: 0.6 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Change avatar"
                    >
                      <Ionicons name="camera" size={16} color={colors.text} />
                    </Pressable>
                  ) : null}
                </View>

                <View style={{ flex: 1 }} />

                {/* Primary button (Follow/Edit) */}
                {editMode ? (
                  <Pressable
                    onPress={onPressPrimary}
                    onLongPress={onLongPressPrimary}
                    delayLongPress={250}
                    style={({ pressed }) => [
                      styles.ghostBtn,
                      { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.background },
                    ]}
                  >
                    <ThemedText style={{ fontWeight: "700", color: colors.text }}>Edit profile</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={onPressPrimary}
                    onLongPress={onLongPressPrimary}
                    delayLongPress={250}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <ThemedText style={{ fontWeight: "800", color: colors.background }}>Follow</ThemedText>
                  </Pressable>
                )}
              </View>

              {/* BIO */}
              <View style={styles.bioBlock}>
                <ThemedText type="defaultSemiBold" style={[styles.displayName, { color: colors.text }]}>
                  {profile.displayName}
                </ThemedText>

                <ThemedText style={[styles.handle, { color: colors.textSecondary }]}>@{profile.handle}</ThemedText>

                {!!profile.bio && <ThemedText style={[styles.bio, { color: colors.text }]}>{profile.bio}</ThemedText>}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                      {profile.location ?? "—"}
                    </ThemedText>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
                    {profile.link ? (
                      <ThemedText style={[styles.metaText, { color: colors.tint }]}>
                        {profile.link.replace(/^https?:\/\//, "")}
                      </ThemedText>
                    ) : (
                      <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>—</ThemedText>
                    )}
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                      {profile.joinedDate ? formatJoined(profile.joinedDate) : "Joined"}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.followsRow}>
                  <ThemedText style={{ color: colors.text }}>
                    <ThemedText type="defaultSemiBold">{formatCount(profile.followingCount ?? 0)}</ThemedText>{" "}
                    <ThemedText style={{ color: colors.textSecondary }}>Following</ThemedText>
                  </ThemedText>

                  <ThemedText style={{ color: colors.text }}>
                    <ThemedText type="defaultSemiBold">{formatCount(profile.followerCount ?? 0)}</ThemedText>{" "}
                    <ThemedText style={{ color: colors.textSecondary }}>Followers</ThemedText>
                  </ThemedText>
                </View>
              </View>

              {/* Tabs (static for now) */}
              <View style={[styles.tabsBar, { borderBottomColor: colors.border }]}>
                <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                  <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                    Posts
                  </ThemedText>
                  <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
                </Pressable>

                <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                  <ThemedText style={{ color: colors.textSecondary }}>Replies</ThemedText>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                  <ThemedText style={{ color: colors.textSecondary }}>Media</ThemedText>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                  <ThemedText style={{ color: colors.textSecondary }}>Likes</ThemedText>
                </Pressable>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <SwipeablePostRow
              sid={sid}
              item={item}
              colors={colors}
              userId={userId}
              getProfileById={getProfileById}
              onDeletePost={onDeletePost}
            />
          )}
          ListEmptyComponent={() => (
            <View style={{ padding: 18 }}>
              <ThemedText style={{ color: colors.textSecondary }}>No posts yet.</ThemedText>
            </View>
          )}
        />

        {/* Picker overlay */}
        {picking && (
          <View style={styles.pickerOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* ✅ Unified viewer */}
        <Lightbox
          urls={lightboxUrls}
          initialIndex={lightboxIndex}
          visible={lightboxOpen}
          onClose={closeLightbox}
          title={profile.displayName}
          allowSave
        />
      </ThemedView>
    </GestureHandlerRootView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1 },

  headerMediaWrap: {
    height: 140,
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  headerMedia: {
    width: "100%",
    height: "100%",
  },

  backBtn: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: [{ translateY: -17 }],
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    zIndex: 10,
  },

  headerControls: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    gap: 10,
    zIndex: 10,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },

  avatarRow: {
    marginTop: -26,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 999,
    padding: 4,
  },
  avatarEditBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    zIndex: 20,
    elevation: 20,
  },

  ghostBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  bioBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  displayName: {
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
  },
  handle: {
    fontSize: 14,
    marginTop: -2,
  },
  bio: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 6,
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 6,
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },

  followsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },

  tabsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
  },
  tabUnderline: {
    height: 4,
    width: 48,
    borderRadius: 999,
    marginTop: 6,
  },

  swipeActions: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 12,
    gap: 10,
  },
  swipeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },

  pressedPop: {
    transform: [{ scale: 0.92 }],
  },
});
