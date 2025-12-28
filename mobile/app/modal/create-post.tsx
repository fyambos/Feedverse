// mobile/app/modal/create-post.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  View,
  StyleSheet,
  TextInput,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons, MaterialIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import type { Post } from "@/data/db/schema";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";
import { formatCount, makeId } from "@/lib/format";

import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";
import { takeAndPersistPhoto } from "@/lib/media/takePicture";
import { RowCard } from "@/components/ui/RowCard";

const MAX_IMAGES = 4;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function clampInt(n: number, min = 0, max = 99_000_000) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function randInt(min: number, max: number) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function toCountStringOrEmpty(n: number) {
  return n > 0 ? String(n) : "";
}

/* -------------------------------------------------------------------------- */
/* Quoted card (kept minimal)                                                  */
/* -------------------------------------------------------------------------- */

function QuotedPostCard({
  quotedPost,
  colors,
  getProfileById,
}: {
  quotedPost: Post;
  colors: any;
  getProfileById: (id: string) => any;
}) {
  const qpAuthor = useMemo(
    () => getProfileById(String(quotedPost.authorProfileId)),
    [quotedPost.authorProfileId, getProfileById]
  );

  return (
    <View style={styles.quoteInner}>
      {qpAuthor?.avatarUrl ? (
        <Image source={{ uri: qpAuthor.avatarUrl }} style={styles.quoteAvatar} />
      ) : (
        <View style={[styles.quoteAvatar, { backgroundColor: colors.border }]} />
      )}

      <View style={{ flex: 1 }}>
        <View style={styles.quoteTopRow}>
          <ThemedText
            numberOfLines={1}
            style={{ fontWeight: "800", color: colors.text, maxWidth: "70%" }}
          >
            {qpAuthor?.displayName ?? "Unknown"}
          </ThemedText>

          <ThemedText
            numberOfLines={1}
            style={{ color: colors.textSecondary, marginLeft: 8, flexShrink: 1 }}
          >
            @{qpAuthor?.handle ?? "unknown"}
          </ThemedText>

          <ThemedText style={{ color: colors.textSecondary }}> · </ThemedText>

          <ThemedText style={{ color: colors.textSecondary }}>
            {new Date(quotedPost.createdAt).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </ThemedText>
        </View>

        <ThemedText
          numberOfLines={3}
          style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}
        >
          {quotedPost.text}
        </ThemedText>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function CreatePostModal() {
  const { scenarioId, postId, parentPostId, quotedPostId } = useLocalSearchParams<{
    scenarioId: string;
    postId?: string;
    parentPostId?: string;
    quotedPostId?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const editingPostId = postId ? String(postId) : "";
  const isEdit = !!editingPostId;

  const { userId } = useAuth();

  const {
    isReady,
    getPostById,
    getProfileById,
    listProfilesForScenario,
    getSelectedProfileId,
    setSelectedProfileId,
    upsertPost,
  } = useAppData();

  const selectedId = getSelectedProfileId(sid);

  const fallbackOwnedProfileId = useMemo(() => {
    const mine = listProfilesForScenario(sid).find(
      (p) => String(p.ownerUserId) === String(userId ?? "")
    );
    return mine?.id ?? null;
  }, [sid, listProfilesForScenario, userId]);

  const initialAuthorId = selectedId ?? fallbackOwnedProfileId;

  const [authorProfileId, setAuthorProfileId] = useState<string | null>(initialAuthorId);

  // picking author while editing: arm + remember previous selectedId to avoid race
  const [pickAuthorArmed, setPickAuthorArmed] = useState(false);
  const [pickAuthorPrevSelectedId, setPickAuthorPrevSelectedId] = useState<string | null>(null);

  const profile = useMemo(() => {
    if (!authorProfileId) return null;
    return getProfileById(String(authorProfileId));
  }, [authorProfileId, getProfileById]);

  const [threadTexts, setThreadTexts] = useState<string[]>([""]);
  const [focusedThreadIndex, setFocusedThreadIndex] = useState<number>(0);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoThumbUri, setVideoThumbUri] = useState<string | null>(null);

  const [addVideoIcon, setAddVideoIcon] = useState<boolean>(false);

  const [picking, setpicking] = useState(false);

  // Thread composer (old Twitter +)
  const setThreadTextAt = useCallback((idx: number, value: string) => {
    setThreadTexts((prev) => {
      const next = [...prev];
      next[idx] = value.slice(0, 500);
      return next;
    });
  }, []);

  const addThreadItem = useCallback(() => {
    setThreadTexts((prev) => [...prev, ""]);
  }, []);

  const removeThreadItem = useCallback((idx: number) => {
    setThreadTexts((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Post settings
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  const [replyCount, setReplyCount] = useState("");
  const [repostCount, setRepostCount] = useState("");
  const [likeCount, setLikeCount] = useState("");

  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [quoteId, setQuoteId] = useState<string | undefined>(undefined);
  // insertedAt should be preserved in edit mode; for create we set it at submit time
  const [insertedAt, setInsertedAt] = useState<string>("");

  const quotedPost = useMemo(() => {
    if (!quoteId) return null;
    return getPostById(String(quoteId));
  }, [quoteId, getPostById]);

  const [hydrated, setHydrated] = useState(false);

  const clearMedia = useCallback(() => {
    setImageUrls([]);
    setVideoThumbUri(null);
    setAddVideoIcon(false);
  }, []);

  // hydrate edit mode OR wire reply/quote in create mode
  useEffect(() => {
    if (!isReady) return;

    const replyParent = parentPostId ? String(parentPostId) : undefined;
    const q = quotedPostId ? String(quotedPostId) : undefined;

    if (!isEdit) {
      setAuthorProfileId((prev) => prev ?? initialAuthorId ?? null);
      setParentId(replyParent);
      setQuoteId(q);
      setHydrated(true);
      return;
    }

    if (hydrated) return;

    const found = getPostById(editingPostId);
    if (!found) {
      router.back();
      return;
    }

    setAuthorProfileId(String(found.authorProfileId));
    setThreadTexts([found.text ?? ""]);
    setDate(new Date(found.createdAt));

    const raw = (found.imageUrls ?? []).slice(0, MAX_IMAGES);
    const foundAddVideoIcon = Boolean((found as any).addVideoIcon);

    if (raw.length === 1 && foundAddVideoIcon) {
      setVideoThumbUri(raw[0]);
      setAddVideoIcon(true);
      setImageUrls([]);
    } else {
      setVideoThumbUri(null);
      setAddVideoIcon(false);
      setImageUrls(raw);
    }

    // keep placeholders for 0
    setReplyCount(toCountStringOrEmpty(found.replyCount ?? 0));
    setRepostCount(toCountStringOrEmpty(found.repostCount ?? 0));
    setLikeCount(toCountStringOrEmpty(found.likeCount ?? 0));

    setParentId(found.parentPostId ? String(found.parentPostId) : replyParent);
    setQuoteId(found.quotedPostId ? String(found.quotedPostId) : q);
    // preserve original insertedAt for edits
    setInsertedAt((found as any).insertedAt ?? found.createdAt ?? new Date().toISOString());

    setHydrated(true);
  }, [
    isReady,
    isEdit,
    hydrated,
    editingPostId,
    parentPostId,
    quotedPostId,
    getPostById,
    initialAuthorId,
  ]);

  useEffect(() => {
    if (!isReady) return;
    if (!pickAuthorArmed) return;
    if (!selectedId) return;

    // wait until selectedId is different from the one we had when opening the modal
    if (pickAuthorPrevSelectedId && String(selectedId) === String(pickAuthorPrevSelectedId)) {
      return;
    }

    setAuthorProfileId(String(selectedId));
    setPickAuthorArmed(false);
    setPickAuthorPrevSelectedId(null);
  }, [isReady, pickAuthorArmed, selectedId, pickAuthorPrevSelectedId]);

  // fallback: if author is missing, assign one
  useEffect(() => {
    if (!isReady) return;
    if (authorProfileId) return;

    const next = selectedId ?? fallbackOwnedProfileId;
    if (next) setAuthorProfileId(String(next));
  }, [isReady, authorProfileId, selectedId, fallbackOwnedProfileId]);

  // keep create-mode behavior: sync selected profile to author (but DO NOT in edit)
  useEffect(() => {
    if (!isReady) return;
    if (isEdit) return;
    if (!authorProfileId) return;
    if (selectedId === authorProfileId) return;

    setSelectedProfileId(sid, String(authorProfileId)).catch(() => {});
  }, [isReady, isEdit, sid, authorProfileId, selectedId, setSelectedProfileId]);

  /* -------------------------------------------------------------------------- */
  /* Counts                                                                      */
  /* -------------------------------------------------------------------------- */

  const counts = useMemo(() => {
    const r1 = clampInt(Number(replyCount || 0), 0, 99_000_000);
    const r2 = clampInt(Number(repostCount || 0), 0, 99_000_000);
    const r3 = clampInt(Number(likeCount || 0), 0, 99_000_000);
    return { reply: r1, repost: r2, like: r3 };
  }, [replyCount, repostCount, likeCount]);

  const setEngagementPreset = (preset: "few" | "mid" | "lot") => {
    let likes = 0;

    if (preset === "few") likes = randInt(0, 80);
    if (preset === "mid") likes = randInt(120, 6_000);
    if (preset === "lot") likes = randInt(30_000, 2_000_000);

    const reposts = clampInt(
      randInt(Math.floor(likes * 0.03), Math.max(0, Math.floor(likes * 0.22))),
      0,
      likes
    );
    const replies = clampInt(
      randInt(Math.floor(reposts * 0.15), Math.max(0, Math.floor(reposts * 0.65))),
      0,
      reposts
    );

    setLikeCount(toCountStringOrEmpty(likes));
    setRepostCount(toCountStringOrEmpty(reposts));
    setReplyCount(toCountStringOrEmpty(replies));
  };

  /* -------------------------------------------------------------------------- */
  /* Media                                                                       */
  /* -------------------------------------------------------------------------- */

  const pickImages = async () => {
    if (videoThumbUri) {
      Alert.alert("Video thumbnail active", "Remove the video thumbnail to add multiple images.");
      return;
    }

    const remaining = Math.max(0, MAX_IMAGES - imageUrls.length);
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    setpicking(true);
    try {
      const picked = await pickAndPersistManyImages({
        remaining,
        persistAs: "img",
        quality: 0.9,
      });

      if (!picked.length) return;

      // selecting images cancels fake video mode
      setAddVideoIcon(false);
      setVideoThumbUri(null);

      setImageUrls((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
    } finally {
      setpicking(false);
    }
  };

  const removeImageAt = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const takePhoto = async () => {
    if (videoThumbUri) {
      Alert.alert("Video thumbnail active", "Remove the video thumbnail to add multiple images.");
      return;
    }

    const remaining = Math.max(0, MAX_IMAGES - imageUrls.length);
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    setpicking(true);
    try {
      const persistedUri = await takeAndPersistPhoto("img");
      if (!persistedUri) return;

      // taking a photo cancels fake video mode
      setAddVideoIcon(false);
      setVideoThumbUri(null);

      setImageUrls((prev) => [...prev, persistedUri].slice(0, MAX_IMAGES));
    } finally {
      setpicking(false);
    }
  };

  // "fake video": pick ONE image and overlay play icon for UI
  const pickVideoThumb = async () => {
    setpicking(true);
    try {
      const picked = await pickAndPersistManyImages({
        remaining: 1,
        persistAs: "img",
        quality: 0.9,
      });

      const uri = picked?.[0];
      if (!uri) return;

      setImageUrls([]);
      setVideoThumbUri(uri);
      setAddVideoIcon(true);
    } finally {
      setpicking(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Submit                                                                      */
  /* -------------------------------------------------------------------------- */

  const canPost =
    !!authorProfileId &&
    threadTexts.length > 0 &&
    threadTexts.every((t) => t.trim().length > 0);

  const onPost = async () => {
    if (!canPost) return;
    if (!authorProfileId) {
      router.back();
      return;
    }

    const mediaForPost = videoThumbUri
      ? [videoThumbUri]
      : imageUrls.slice(0, MAX_IMAGES);

    const addVideoIconForPost = Boolean(videoThumbUri) && addVideoIcon;

    const isStandaloneCreate = !isEdit && !parentId && !quoteId;

    // EDIT: single post only (no threading)
    if (isEdit) {
      const base: Post & { addVideoIcon?: boolean } = {
        id: editingPostId,
        scenarioId: sid,
        authorProfileId: String(authorProfileId),
        text: (threadTexts[0] ?? "").trim(),
        createdAt: date.toISOString(),
        imageUrls: mediaForPost,
        replyCount: counts.reply,
        repostCount: counts.repost,
        likeCount: counts.like,
        parentPostId: parentId,
        quotedPostId: quoteId,
        insertedAt: insertedAt || new Date().toISOString(), // preserve when available
        addVideoIcon: addVideoIconForPost,
      };

      await upsertPost(base as any);
      router.back();
      return;
    }

    // CREATE: if reply/quote, keep single post behavior
    if (!isStandaloneCreate) {
      const postedAtIso = new Date().toISOString();
      const base: Post & { addVideoIcon?: boolean } = {
        id: makeId("po"),
        scenarioId: sid,
        authorProfileId: String(authorProfileId),
        text: (threadTexts[0] ?? "").trim(),
        createdAt: postedAtIso,
        imageUrls: mediaForPost,
        replyCount: counts.reply,
        repostCount: counts.repost,
        likeCount: counts.like,
        parentPostId: parentId,
        quotedPostId: quoteId,
        insertedAt: postedAtIso,
        addVideoIcon: addVideoIconForPost,
      };

      await upsertPost(base as any);
      await setSelectedProfileId(sid, String(authorProfileId));
      router.back();
      return;
    }

    // CREATE: thread (chain items as replies to previous)
    const baseTime = new Date();
    const insertedAtBaseIso = baseTime.toISOString();
    let prevId: string | undefined = undefined;

    for (let i = 0; i < threadTexts.length; i++) {
      const id = makeId("po");
      const createdAt = new Date(baseTime.getTime() + i * 1000).toISOString(); // stable order

      const post: Post & { addVideoIcon?: boolean } = {
        id,
        scenarioId: sid,
        authorProfileId: String(authorProfileId),
        text: threadTexts[i].trim(),
        createdAt,
        // keep media + engagement only on first post for now
        imageUrls: i === 0 ? mediaForPost : [],
        replyCount: i === 0 ? counts.reply : 0,
        repostCount: i === 0 ? counts.repost : 0,
        likeCount: i === 0 ? counts.like : 0,
        parentPostId: i === 0 ? undefined : prevId,
        quotedPostId: undefined,
        insertedAt: insertedAtBaseIso,
        addVideoIcon: i === 0 ? addVideoIconForPost : false,
      };

      await upsertPost(post as any);
      prevId = id;
    }

    await setSelectedProfileId(sid, String(authorProfileId));
    router.back();
  };

  /* -------------------------------------------------------------------------- */
  /* iOS Picker (stays open until Done / tap outside)                            */
  /* -------------------------------------------------------------------------- */

  const openPicker = (mode: "date" | "time") => {
    setPickerMode(mode);
    setShowDatePicker(true);
  };

  const closePicker = () => setShowDatePicker(false);

  const PickerOverlayIOS = () => {
    if (!showDatePicker || Platform.OS !== "ios") return null;

    return (
      <Pressable style={styles.pickerOverlay} onPress={closePicker}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.pickerCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.pickerHeader}>
            <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
              {pickerMode === "date" ? "Choose date" : "Choose time"}
            </ThemedText>

            <Pressable
              onPress={closePicker}
              hitSlop={10}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>
                Done
              </ThemedText>
            </Pressable>
          </View>

          <DateTimePicker
            value={date}
            mode={pickerMode}
            display="spinner"
            onChange={(_, selected) => {
              if (selected) setDate(selected);
            }}
          />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        {picking ? (
          <View style={styles.pickerOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          {/* HEADER */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 16 }}>
                Cancel
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={onPost}
              disabled={!canPost}
              hitSlop={10}
              style={({ pressed }) => [
                styles.postBtn,
                {
                  backgroundColor: colors.tint,
                  opacity: !canPost ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                {isEdit ? "Save" : "Post"}
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            {/* COMPOSER */}
            <View style={styles.composer}>
              <Pressable
                onPress={() => {
                  // arm selection and remember current selectedId so we can detect a real change
                  setPickAuthorArmed(true);
                  setPickAuthorPrevSelectedId(selectedId ? String(selectedId) : "");
                  router.push({
                    pathname: "/modal/select-profile",
                    params: { scenarioId: sid },
                  } as any);
                }}
                hitSlop={10}
                style={({ pressed }) => [pressed && { opacity: 0.75 }]}
              >
                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.border }]} />
                )}
              </Pressable>

              <View style={{ flex: 1 }}>
                {threadTexts.map((value, idx) => {
                  const isLast = idx === threadTexts.length - 1;
                  const canRemove = !isEdit && !parentId && !quoteId && threadTexts.length > 1;

                  return (
                    <View key={`thread_${idx}`} style={styles.threadItemWrap}>
                      {/* remove button (inline, but does NOT steal width from the input) */}
                      {canRemove ? (
                        <Pressable
                          onPress={() => removeThreadItem(idx)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.threadRemoveFloat,
                            {
                              opacity: pressed ? 0.6 : 1,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        >
                          <Ionicons
                            name="close"
                            size={14}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                      ) : null}

                      <TextInput
                        value={value}
                        onChangeText={(v) => setThreadTextAt(idx, v)}
                        onFocus={() => setFocusedThreadIndex(idx)}
                        placeholder={idx === 0 ? "What’s happening?" : "Add another post"}
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={[
                          styles.input,
                          styles.threadInput,
                          { color: colors.text, paddingRight: canRemove ? 34 : 0 },
                        ]}
                        selectionColor={colors.tint}
                        maxLength={500}
                        scrollEnabled
                        textAlignVertical="top"
                      />

                      {/* per-item footer (right-aligned count like before; only for focused input) */}
                      <View style={styles.threadFooterRow}>
                        <View style={{ flex: 1 }} />

                        {focusedThreadIndex === idx ? (
                          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                            {value.length}/500
                          </ThemedText>
                        ) : null}

                        {!isEdit && !parentId && !quoteId && isLast ? (
                          <Pressable
                            onPress={addThreadItem}
                            disabled={
                              (threadTexts[threadTexts.length - 1] ?? "").trim().length === 0
                            }
                            hitSlop={10}
                            style={({ pressed }) => [
                              styles.threadPlusTiny,
                              {
                                opacity:
                                  (threadTexts[threadTexts.length - 1] ?? "").trim().length === 0
                                    ? 0.35
                                    : pressed
                                    ? 0.8
                                    : 1,
                              },
                            ]}
                          >
                            <Ionicons name="add" size={16} color={colors.tint} />
                          </Pressable>
                        ) : null}
                      </View>

                      {/* full-width divider between thread items (spans under the avatar too) */}
                      {!isLast ? (
                        <View
                          style={[
                            styles.threadDividerFull,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      ) : null}
                    </View>
                  );
                })}

                {/* media preview */}
                {videoThumbUri ? (
                  <View style={styles.mediaGrid}>
                    <View style={[styles.mediaThumbWrap, styles.mediaThumbWrapSingle]}>
                      <Image source={{ uri: videoThumbUri }} style={styles.mediaThumb} />

                      {addVideoIcon ? (
                        <View style={styles.playOverlay}>
                          <Ionicons name="play-circle" size={56} color="#fff" />
                        </View>
                      ) : null}

                      <Pressable
                        onPress={clearMedia}
                        hitSlop={10}
                        style={({ pressed }) => [
                          styles.mediaRemove,
                          {
                            opacity: pressed ? 0.85 : 1,
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Ionicons name="close" size={16} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>
                ) : imageUrls.length > 0 ? (
                  <View style={styles.mediaGrid}>
                    {imageUrls.map((uri, idx) => (
                      <View
                        key={`${uri}_${idx}`}
                        style={[
                          styles.mediaThumbWrap,
                          imageUrls.length === 1 && styles.mediaThumbWrapSingle,
                        ]}
                      >
                        <Image source={{ uri }} style={styles.mediaThumb} />
                        <Pressable
                          onPress={() => removeImageAt(idx)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.mediaRemove,
                            {
                              opacity: pressed ? 0.85 : 1,
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Ionicons name="close" size={16} color={colors.text} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {quotedPost ? (
                  <Pressable
                    onPress={() => {
                      router.push(
                        `/(scenario)/${sid}/(tabs)/post/${String(quotedPost.id)}` as any
                      );
                    }}
                    style={({ pressed }) => [
                      styles.quoteCard,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.pressed : colors.background,
                      },
                    ]}
                  >
                    <QuotedPostCard
                      quotedPost={quotedPost}
                      colors={colors}
                      getProfileById={getProfileById}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={[styles.softDivider, { backgroundColor: colors.border }]} />

            {/* TOOLBAR */}
            <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={takePhoto}
                hitSlop={10}
                style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="camera-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable
                onPress={pickImages}
                hitSlop={10}
                style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="image-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable
                hitSlop={10}
                style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons name="gif" size={22} color={colors.tint} />
              </Pressable>

              {/* fake video thumbnail picker */}
              <Pressable
                onPress={pickVideoThumb}
                hitSlop={10}
                style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="videocam-outline" size={22} color={colors.tint} />
              </Pressable>
            </View>

            {/* META CONTROLS */}
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                Post settings
              </ThemedText>

              <RowCard label="Date" colors={colors}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Pressable
                    onPress={() => openPicker("date")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
                      {date.toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => openPicker("time")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
                      {date.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </ThemedText>
                  </Pressable>
                </View>
              </RowCard>

              <RowCard label="Engagement" colors={colors}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    onPress={() => setEngagementPreset("few")}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons name="person-outline" size={18} color={colors.text} />
                    <ThemedText style={{ color: colors.text, fontWeight: "700" }}>
                      few
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => setEngagementPreset("mid")}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons name="people-outline" size={18} color={colors.text} />
                    <ThemedText style={{ color: colors.text, fontWeight: "700" }}>
                      mid
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => setEngagementPreset("lot")}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons name="rocket-outline" size={18} color={colors.text} />
                    <ThemedText style={{ color: colors.text, fontWeight: "700" }}>
                      lot
                    </ThemedText>
                  </Pressable>
                </View>
              </RowCard>

              <View style={styles.rowGrid}>
                <View style={{ flex: 1 }}>
                  <RowCard
                    label="Replies"
                    colors={colors}
                    right={
                      <ThemedText style={{ color: colors.textSecondary }}>
                        {formatCount(counts.reply)}
                      </ThemedText>
                    }
                  >
                    <TextInput
                      value={replyCount}
                      onChangeText={setReplyCount}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      style={[styles.rowInput, { color: colors.text }]}
                      selectionColor={colors.tint}
                    />
                  </RowCard>
                </View>

                <View style={{ flex: 1 }}>
                  <RowCard
                    label="Reposts"
                    colors={colors}
                    right={
                      <ThemedText style={{ color: colors.textSecondary }}>
                        {formatCount(counts.repost)}
                      </ThemedText>
                    }
                  >
                    <TextInput
                      value={repostCount}
                      onChangeText={setRepostCount}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      style={[styles.rowInput, { color: colors.text }]}
                      selectionColor={colors.tint}
                    />
                  </RowCard>
                </View>
              </View>

              <RowCard
                label="Likes"
                colors={colors}
                right={
                  <ThemedText style={{ color: colors.textSecondary }}>
                    {formatCount(counts.like)}
                  </ThemedText>
                }
              >
                <TextInput
                  value={likeCount}
                  onChangeText={setLikeCount}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={[styles.rowInput, { color: colors.text }]}
                  selectionColor={colors.tint}
                />
              </RowCard>
            </View>

            {showDatePicker && Platform.OS !== "ios" ? (
              <DateTimePicker
                value={date}
                mode={pickerMode}
                display="default"
                onChange={(_, selected) => {
                  setShowDatePicker(false);
                  if (selected) setDate(selected);
                }}
              />
            ) : null}
          </ScrollView>

          <PickerOverlayIOS />
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 72,
    alignItems: "center",
  },

  composer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
  },

  input: {
    fontSize: 19,
    lineHeight: 24,
    paddingTop: 2,
    paddingBottom: 6,
    minHeight: 0,
    maxHeight: 260,
  },

  mediaGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mediaThumbWrap: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  mediaThumbWrapSingle: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  mediaThumb: {
    width: "100%",
    height: "100%",
  },
  mediaRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },

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
  quoteAvatar: {
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

  softDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
  },

  section: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  rowGrid: {
    flexDirection: "row",
    gap: 10,
  },

  rowInput: {
    fontSize: 16,
    paddingVertical: 0,
  },

  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },

  presetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  pickerCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingBottom: 8,
  },
  pickerHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  threadItemWrap: {
    width: "100%",
    alignSelf: "stretch",
    position: "relative",
  },
  threadRemoveFloat: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  threadInput: {
    width: "100%",
    alignSelf: "stretch",
    maxHeight: 260,
  },
  threadFooterRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  threadDividerFull: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginTop: 12,
    width: "auto",
    alignSelf: "stretch",
    marginLeft: -(42 + 12),
  },
  threadPlusTiny: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});