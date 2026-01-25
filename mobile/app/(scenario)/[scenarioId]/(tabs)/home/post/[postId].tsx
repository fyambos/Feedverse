// mobile/app/(scenario)/[scenarioId]/(tabs)/home/post/[postId].tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MemoPost as PostCard } from "@/components/post/Post";

import { SwipeableRow } from "@/components/ui/SwipeableRow";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import type { Post } from "@/data/db/schema";

import { canEditPost } from "@/lib/access/permission";

import * as MediaLibrary from "expo-media-library";
import { captureRef } from "react-native-view-shot";
import { Alert } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/utils/format";

export default function PostScreen() {
  const { scenarioId, postId, from, focusPostId: focusPostIdParam } = useLocalSearchParams<{
    scenarioId: string;
    postId: string;
    from?: string;
    focusPostId?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const pid = decodeURIComponent(String(postId ?? ""));
  const focusPostId = (() => {
    const raw = Array.isArray(focusPostIdParam) ? focusPostIdParam[0] : focusPostIdParam;
    const v = String(raw ?? "");
    return v ? decodeURIComponent(v) : "";
  })();

  const fromPath =
    typeof from === "string" && from.length > 0
      ? from
      : `/(scenario)/${encodeURIComponent(sid)}/(tabs)/home`;

  const { userId } = useAuth();
  const {
    isReady,
    getPostById,
    getProfileById,
    listRepliesForPost,
    deletePost,

    toggleLike,
    isPostLikedBySelectedProfile,

    toggleRepost,
    isPostRepostedBySelectedProfile,
  } = useAppData();

  const deletePostRef = useRef(false);

  const openEditPost = useCallback(
    (id: string) => {
      router.push({
        pathname: "/modal/create-post",
        params: { scenarioId: sid, mode: "edit", postId: String(id) },
      } as any);
    },
    [sid]
  );

  const onDeletePost = useCallback(
    async (id: string) => {
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
                await deletePost(String(id));
                // After deletion, go back to where the user came from.
                try {
                  if (router.canGoBack?.()) router.back();
                  else router.replace(fromPath as any);
                } catch {}
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
    [deletePost, fromPath]
  );

  const root = isReady ? getPostById(pid) : null;
  const isDeletedRoot = isReady && !root;

  const isMissingParent =
    isReady && !!root?.parentPostId && !getPostById(String(root.parentPostId));
  const showDeletedPlaceholder = isDeletedRoot || isMissingParent;

  const thread = useMemo(() => {
    if (!isReady) return null;

    const result: Post[] = [];
    if (root) result.push(root);

    const walk = (parentId: string) => {
      const children = [...listRepliesForPost(parentId)].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt))
      );

      for (const child of children) {
        result.push(child);
        walk(String(child.id));
      }
    };

    walk(pid);
    return result;
  }, [isReady, root, pid, listRepliesForPost]);

  const listRef = useRef<FlatList<any> | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string>("");

  useEffect(() => {
    if (!focusPostId) return;
    setHighlightPostId(String(focusPostId));
    const t = setTimeout(() => setHighlightPostId(""), 3200);
    return () => clearTimeout(t);
  }, [focusPostId, pid]);

  useEffect(() => {
    if (!focusPostId) return;
    if (!thread || thread.length === 0) return;
    const idx = thread.findIndex((p) => String((p as any)?.id ?? "") === String(focusPostId));
    if (idx < 0) return;
    // Scroll after layout.
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex?.({ index: idx, animated: true, viewPosition: 0.2 });
      } catch {}
    });
  }, [focusPostId, thread?.length]);

  const onBack = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace(fromPath as any);
  }, [fromPath]);

  const HeaderInScreenshot = (
    <View
      style={[
        styles.captureHeader,
        { borderBottomColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.captureHeaderBtn}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>

      <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
        Post
      </ThemedText>

      {/* right spacer to keep title centered */}
      <View style={styles.captureHeaderBtn} />
    </View>
  );

  // ====== CAPTURE LOGIC (NO snapshotContentContainer) ======
  const [isCapturing, setIsCapturing] = useState(false);
  const captureRootRef = useRef<View>(null);

  const waitFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  const onShareScreenshot = useCallback(async () => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow Photos permission to save the screenshot.");
        return;
      }

      if (!thread || thread.length === 0) {
        Alert.alert("Share failed", "Nothing to capture yet.");
        return;
      }

      // mount the hidden capture view
      setIsCapturing(true);
      await waitFrame();
      await waitFrame(); // helps layout settle

      const node = captureRootRef.current;
      if (!node) {
        setIsCapturing(false);
        Alert.alert("Share failed", "Nothing to capture yet.");
        return;
      }

      const uri = await captureRef(node, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      setIsCapturing(false);

      if (!uri) {
        Alert.alert("Share failed", "Could not capture screenshot.");
        return;
      }

      await MediaLibrary.createAssetAsync(uri);
      Alert.alert("Saved", "Screenshot saved to your gallery.");
    } catch (e: any) {
      setIsCapturing(false);
      Alert.alert("Share failed", formatErrorMessage(e, "Could not save screenshot."));
    }
  }, [thread]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* hide native header so the screenshot can include the custom header */}
      <Stack.Screen options={{ headerShown: false }} />

      {!isReady ? (
        <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Loading…</ThemedText>
        </ThemedView>
      ) : !thread ? (
        <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Post not found.</ThemedText>
        </ThemedView>
      ) : (
        <>
          <FlatList
            ref={(r) => {
              listRef.current = r as any;
            }}
            data={thread}
            keyExtractor={(i) => String(i.id)}
            onScrollToIndexFailed={() => {
              // Best-effort: don't crash if the item isn't measured yet.
              try {
                listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
              } catch {}
            }}
            ListHeaderComponent={
              <View>
                {HeaderInScreenshot}

                {showDeletedPlaceholder ? (
                  <View style={[styles.deletedWrap, { borderColor: colors.border }]}>
                    <ThemedText style={{ color: colors.text, fontWeight: "700" }}>Deleted post</ThemedText>
                    <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                      This post is no longer available.
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item, index }) => {
              const itemId = String(item.id);

              const liveItem = getPostById(itemId) ?? item;

              const authorProfileId = item.authorProfileId ? String(item.authorProfileId) : "";
              const profile = authorProfileId ? getProfileById(authorProfileId) : null;
              if (!profile) return null;

              const parent = item.parentPostId ? getPostById(String(item.parentPostId)) : null;
              const parentProfile = parent?.authorProfileId
                ? getProfileById(String(parent.authorProfileId))
                : null;

              const isRoot = itemId === pid;
              const focusedIsReply = isRoot && !!item.parentPostId;
              const variant = isRoot && !focusedIsReply ? "detail" : "reply";

              const canEdit = canEditPost({ authorProfile: profile, userId });

              const next = thread[index + 1];
              const showThreadLine = !!next && String(next.parentPostId ?? "") === String(item.id);

              const liked = isPostLikedBySelectedProfile(sid, itemId);
              const reposted = isPostRepostedBySelectedProfile(sid, itemId);

              // Share behavior:
              // - detail root: saves screenshot
              // - reply items: do nothing (but still animates)
              const onShare =
                variant === "detail"
                  ? onShareScreenshot
                  : () => {
                      /* noop */
                    };

              const content = (
                <PostCard
                  scenarioId={sid}
                  profile={profile as any}
                  item={liveItem as any}
                  variant={variant}
                  replyingTo={parentProfile?.handle}
                  showActions
                  showThreadLine={showThreadLine}
                  highlighted={String(itemId) === String(highlightPostId)}
                  isLiked={liked}
                  onLike={() => {
                    void toggleLike(sid, itemId).catch((e: unknown) => {
                      Alert.alert("Could not like", formatErrorMessage(e, "Please try again."));
                    });
                  }}
                  isReposted={reposted}
                  onRepost={() => {
                    void toggleRepost(sid, itemId).catch((e: unknown) => {
                      Alert.alert("Could not repost", formatErrorMessage(e, "Please try again."));
                    });
                  }}
                  onShare={onShare}
                />
              );

              return (
                <SwipeableRow
                  enabled={canEdit}
                  colors={colors}
                  rightThreshold={24}
                  onEdit={() => openEditPost(itemId)}
                  onDelete={() => onDeletePost(itemId)}
                >
                  {content}
                </SwipeableRow>
              );
            }}
          />

          {/* Hidden capture sheet (mounted only during share) */}
          {isCapturing ? (
            <View style={styles.hiddenCaptureWrap} pointerEvents="none">
              <View
                ref={captureRootRef}
                collapsable={false}
                style={[
                  styles.captureSheet,
                  { backgroundColor: colors.background, width: Dimensions.get("window").width },
                ]}
              >
                {HeaderInScreenshot}

                {showDeletedPlaceholder ? (
                  <View style={[styles.deletedWrap, { borderColor: colors.border }]}>
                    <ThemedText style={{ color: colors.text, fontWeight: "700" }}>Deleted post</ThemedText>
                    <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                      This post is no longer available.
                    </ThemedText>
                  </View>
                ) : null}

                {thread.map((item, index) => {
                  const itemId = String(item.id);

                  const authorProfileId = item.authorProfileId ? String(item.authorProfileId) : "";
                  const profile = authorProfileId ? getProfileById(authorProfileId) : null;
                  if (!profile) return null;

                  const parent = item.parentPostId ? getPostById(String(item.parentPostId)) : null;
                  const parentProfile = parent?.authorProfileId
                    ? getProfileById(String(parent.authorProfileId))
                    : null;

                  const isRoot = itemId === pid;
                  const focusedIsReply = isRoot && !!item.parentPostId;
                  const variant = isRoot && !focusedIsReply ? "detail" : "reply";

                  const next = thread[index + 1];
                  const showThreadLine = !!next && String(next.parentPostId ?? "") === String(item.id);

                  const liked = isPostLikedBySelectedProfile(sid, itemId);
                  const reposted = isPostRepostedBySelectedProfile(sid, itemId);

                  return (
                    <PostCard
                      key={itemId}
                      scenarioId={sid}
                      profile={profile as any}
                      item={item as any}
                      variant={variant}
                      replyingTo={parentProfile?.handle}
                      showActions
                      showThreadLine={showThreadLine}
                      isLiked={liked}
                      onLike={() => {}}
                      isReposted={reposted}
                      onRepost={() => {}}
                      onShare={() => {}}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </>
      )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  captureHeader: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  captureHeaderBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },

  deletedWrap: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    opacity: 0.9,
  },

  hiddenCaptureWrap: {
    position: "absolute",
    left: -99999,
    top: 0,
    opacity: 0,
  },
  captureSheet: {
    paddingBottom: 16,
  },
});