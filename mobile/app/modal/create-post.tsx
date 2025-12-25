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
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

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

const MAX_IMAGES = 4;

function clampInt(n: number, min = 0, max = 99_000_000) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function RowCard({
  label,
  children,
  right,
  colors,
}: {
  label: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
        {children}
      </View>
      {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
    </View>
  );
}

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

        <ThemedText numberOfLines={3} style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}>
          {quotedPost.text}
        </ThemedText>
      </View>
    </View>
  );
}

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

  // AppData-selected profile (source of truth)
  const selectedId = getSelectedProfileId(sid);

  const fallbackOwnedProfileId = useMemo(() => {
    const mine = listProfilesForScenario(sid).find((p) => String(p.ownerUserId) === String(userId ?? ""));
    return mine?.id ?? null;
  }, [sid, listProfilesForScenario, userId]);

  const initialAuthorId = selectedId ?? fallbackOwnedProfileId;

  // local author state (so edit mode locks it + to control UI)
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(initialAuthorId);
  const [pickAuthorArmed, setPickAuthorArmed] = useState(false);

  const profile = useMemo(() => {
    if (!authorProfileId) return null;
    return getProfileById(String(authorProfileId));
  }, [authorProfileId, getProfileById]);

  const [text, setText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [replyCount, setReplyCount] = useState("");
  const [repostCount, setRepostCount] = useState("");
  const [likeCount, setLikeCount] = useState("");

  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [quoteId, setQuoteId] = useState<string | undefined>(undefined);

  const quotedPost = useMemo(() => {
    if (!quoteId) return null;
    return getPostById(String(quoteId));
  }, [quoteId, getPostById]);

  const [hydrated, setHydrated] = useState(false);

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

    // edit mode: author locked to original
    setAuthorProfileId(String(found.authorProfileId));
    setText(found.text ?? "");
    setDate(new Date(found.createdAt));
    setReplyCount(String(found.replyCount ?? 0));
    setRepostCount(String(found.repostCount ?? 0));
    setLikeCount(String(found.likeCount ?? 0));
    setImageUrls((found.imageUrls ?? []).slice(0, MAX_IMAGES));

    setParentId(found.parentPostId ? String(found.parentPostId) : replyParent);
    setQuoteId(found.quotedPostId ? String(found.quotedPostId) : q);

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

  /**
   * ✅ IMPORTANT FIX:
   * When you come back from /modal/select-profile, expo-router sometimes doesn’t
   * re-run your effects the way you expect. Using focus ensures we sync reliably.
   */
  useFocusEffect(
    useCallback(() => {
      if (!isReady) return;

      if (!isEdit && pickAuthorArmed && selectedId) {
        setAuthorProfileId(String(selectedId));
        setPickAuthorArmed(false);
      }

      // also: if we have no author yet, pick a sensible default
      if (!isEdit && !authorProfileId) {
        const next = selectedId ?? fallbackOwnedProfileId;
        if (next) setAuthorProfileId(String(next));
      }
    }, [
      isReady,
      isEdit,
      pickAuthorArmed,
      selectedId,
      authorProfileId,
      fallbackOwnedProfileId,
    ])
  );

  // keep DB selection synced (so other screens know “current profile”)
  useEffect(() => {
    if (!isReady) return;
    if (isEdit) return; // don’t mutate scenario selection while editing an old post
    if (!authorProfileId) return;
    if (selectedId === authorProfileId) return;

    setSelectedProfileId(sid, String(authorProfileId)).catch(() => {});
  }, [isReady, isEdit, sid, authorProfileId, selectedId, setSelectedProfileId]);

  const pickImages = async () => {
    const remaining = Math.max(0, MAX_IMAGES - imageUrls.length);
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    const picked = await pickAndPersistManyImages({
      remaining,
      persistAs: "img",
      quality: 0.9,
    });

    if (!picked.length) return;
    setImageUrls((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  };

  const removeImageAt = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const canPost = text.trim().length > 0 && !!authorProfileId;

  const counts = useMemo(() => {
    const r1 = clampInt(Number(replyCount || 0), 0, 99_000_000);
    const r2 = clampInt(Number(repostCount || 0), 0, 99_000_000);
    const r3 = clampInt(Number(likeCount || 0), 0, 99_000_000);
    return { reply: r1, repost: r2, like: r3 };
  }, [replyCount, repostCount, likeCount]);

  const onPost = async () => {
    if (!canPost) return;
    if (!authorProfileId) {
      router.back();
      return;
    }

    const base: Post = {
      id: isEdit ? editingPostId : makeId("po"),
      scenarioId: sid,
      authorProfileId: String(authorProfileId),
      text: text.trim(),
      createdAt: date.toISOString(),
      imageUrls: imageUrls.slice(0, MAX_IMAGES),
      replyCount: counts.reply,
      repostCount: counts.repost,
      likeCount: counts.like,
      parentPostId: parentId,
      quotedPostId: quoteId,
    };

    await upsertPost(base);

    // keep selection consistent after posting
    if (!isEdit) {
      await setSelectedProfileId(sid, String(authorProfileId));
    }

    router.back();
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
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
              <ThemedText style={{ color: colors.text, fontSize: 16 }}>Cancel</ThemedText>
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
                disabled={isEdit}
                onPress={() => {
                  if (isEdit) return;
                  setPickAuthorArmed(true);
                  router.push({ pathname: "/modal/select-profile", params: { scenarioId: sid } } as any);
                }}
                hitSlop={10}
                style={({ pressed }) => [pressed && !isEdit && { opacity: 0.75 }]}
              >
                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.border }]} />
                )}
              </Pressable>

              <View style={{ flex: 1 }}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setText(v.slice(0, 500))}
                  placeholder="What’s happening?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.input, { color: colors.text }]}
                  selectionColor={colors.tint}
                  maxLength={500}
                  scrollEnabled
                  textAlignVertical="top"
                />

                {/* image preview grid + remove */}
                {imageUrls.length > 0 ? (
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
                      router.push(`/(scenario)/${sid}/(tabs)/post/${String(quotedPost.id)}` as any);
                    }}
                    style={({ pressed }) => [
                      styles.quoteCard,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.pressed : colors.background,
                      },
                    ]}
                  >
                    <QuotedPostCard quotedPost={quotedPost} colors={colors} getProfileById={getProfileById} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={{ alignItems: "flex-end", marginTop: 4 }}>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>{text.length}/500</ThemedText>
            </View>

            <View style={[styles.softDivider, { backgroundColor: colors.border }]} />

            {/* TOOLBAR */}
            <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
              <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="camera-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable onPress={pickImages} hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="image-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <MaterialIcons name="gif" size={22} color={colors.tint} />
              </Pressable>
            </View>

            {/* META CONTROLS */}
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Post settings</ThemedText>

              <RowCard label="Date" colors={colors}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <Pressable
                    onPress={() => {
                      setPickerMode("date");
                      setShowDatePicker(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
                      {date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setPickerMode("time");
                      setShowDatePicker(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
                      {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </ThemedText>
                  </Pressable>
                </View>
              </RowCard>

              <View style={styles.rowGrid}>
                <View style={{ flex: 1 }}>
                  <RowCard
                    label="Replies"
                    colors={colors}
                    right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.reply)}</ThemedText>}
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
                    right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.repost)}</ThemedText>}
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
                right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.like)}</ThemedText>}
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

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode={pickerMode}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_: any, selected: Date | undefined) => {
                  setShowDatePicker(false);
                  if (selected) setDate(selected);
                }}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

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

  rowCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  rowLabel: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "700",
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
});
