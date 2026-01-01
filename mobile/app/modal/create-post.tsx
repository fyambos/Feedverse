// mobile/app/modal/create-post.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import type { Post } from "@/data/db/schema";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";
import { takeAndPersistPhoto } from "@/lib/media/takePicture";
import { makeId } from "@/lib/format";

import {
  clampCountFromText,
  clampInt,
  limitCountText,
  makeEngagementPreset,
  MAX_COUNT,
  toCountStringOrEmpty,
} from "@/lib/postComposer/counts";

import { MAX_IMAGES, mediaForPost, remainingSlots, uniqueLimit } from "@/lib/postComposer/media";

import { QuotedPostCard } from "@/components/postComposer/QuotedPostCard";
import { DateTimePickerOverlay } from "@/components/postComposer/DateTimePickerOverlay";
import { CreatePostHeader } from "@/components/postComposer/CreatePostHeader";
import { AuthorAvatarPicker } from "@/components/postComposer/AuthorAvatarPicker";
import { ThreadComposer } from "@/components/postComposer/ThreadComposer";
import { MediaPreview } from "@/components/postComposer/MediaPreview";
import { PostSettingsSection } from "@/components/postComposer/PostSettingSection";
import { ComposerToolbar } from "@/components/postComposer/ComposerToolbar";

import { RowCard } from "@/components/ui/RowCard";
import { PostTypePicker } from "@/components/postComposer/PostTypePicker";
import type { PostType } from "@/lib/campaign/postTypes";

type Params = {
  scenarioId: string;
  postId?: string;
  parentPostId?: string;
  quotedPostId?: string;
};

function isTruthyText(s: string) {
  return (s ?? "").trim().length > 0;
}

export default function CreatePostModal() {
  const { scenarioId, postId, parentPostId, quotedPostId } = useLocalSearchParams<Params>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const editingPostId = postId ? String(postId) : "";
  const isEdit = Boolean(editingPostId);

  const { userId } = useAuth();
  const {
    isReady,
    getScenarioById,
    getPostById,
    getProfileById,
    listProfilesForScenario,
    getSelectedProfileId,
    setSelectedProfileId,
    upsertPost,
  } = useAppData();

  const scenario = useMemo(() => getScenarioById?.(sid) ?? null, [sid, getScenarioById]);
  const isCampaign = scenario?.mode === "campaign";

  // campaign state
  const [postType, setPostType] = useState<PostType>("rp");
  const [meta, setMeta] = useState<any>(undefined);

  const selectedId = getSelectedProfileId(sid);

  const fallbackOwnedProfileId = useMemo(() => {
    const mine = listProfilesForScenario(sid).find((p) => String(p.ownerUserId) === String(userId ?? ""));
    return mine?.id ?? null;
  }, [sid, listProfilesForScenario, userId]);

  const initialAuthorId = selectedId ?? fallbackOwnedProfileId;
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(initialAuthorId);

  // author picking coordination (avoid race while editing)
  const [pickAuthorArmed, setPickAuthorArmed] = useState(false);
  const [pickAuthorPrevSelectedId, setPickAuthorPrevSelectedId] = useState<string | null>(null);

  const profile = useMemo(() => {
    if (!authorProfileId) return null;
    return getProfileById(String(authorProfileId));
  }, [authorProfileId, getProfileById]);

  // thread
  const [threadTexts, setThreadTexts] = useState<string[]>([""]);
  const [focusedThreadIndex, setFocusedThreadIndex] = useState(0);

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

  // media
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoThumbUri, setVideoThumbUri] = useState<string | null>(null);
  const [addVideoIcon, setAddVideoIcon] = useState(false);
  const [picking, setPicking] = useState(false);

  const clearMedia = useCallback(() => {
    setImageUrls([]);
    setVideoThumbUri(null);
    setAddVideoIcon(false);
  }, []);

  const guardNoVideoThumb = useCallback(() => {
    if (!videoThumbUri) return true;
    Alert.alert("Video thumbnail active", "Remove the video thumbnail to add multiple images.");
    return false;
  }, [videoThumbUri]);

  const pickImages = useCallback(async () => {
    if (!guardNoVideoThumb()) return;

    const remaining = remainingSlots(imageUrls.length, MAX_IMAGES);
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    setPicking(true);
    try {
      const picked = await pickAndPersistManyImages({
        remaining,
        persistAs: "img",
        quality: 0.9,
      });

      if (!picked.length) return;

      setAddVideoIcon(false);
      setVideoThumbUri(null);
      setImageUrls((prev) => uniqueLimit([...prev, ...picked], MAX_IMAGES));
    } finally {
      setPicking(false);
    }
  }, [guardNoVideoThumb, imageUrls.length]);

  const takePhoto = useCallback(async () => {
    if (!guardNoVideoThumb()) return;

    const remaining = remainingSlots(imageUrls.length, MAX_IMAGES);
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    setPicking(true);
    try {
      const persistedUri = await takeAndPersistPhoto("img");
      if (!persistedUri) return;

      setAddVideoIcon(false);
      setVideoThumbUri(null);
      setImageUrls((prev) => uniqueLimit([...prev, persistedUri], MAX_IMAGES));
    } finally {
      setPicking(false);
    }
  }, [guardNoVideoThumb, imageUrls.length]);

  const pickVideoThumb = useCallback(async () => {
    setPicking(true);
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
      setPicking(false);
    }
  }, []);

  const removeImageAt = useCallback((idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // date/time
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  const openPicker = useCallback((mode: "date" | "time") => {
    setPickerMode(mode);
    setShowDatePicker(true);
  }, []);

  const closePicker = useCallback(() => setShowDatePicker(false), []);

  // counts
  const [replyCount, setReplyCount] = useState("");
  const [repostCount, setRepostCount] = useState("");
  const [likeCount, setLikeCount] = useState("");

  const counts = useMemo(
    () => ({
      reply: clampCountFromText(replyCount),
      repost: clampCountFromText(repostCount),
      like: clampCountFromText(likeCount),
    }),
    [replyCount, repostCount, likeCount]
  );

  const setEngagementPreset = useCallback((preset: "few" | "mid" | "lot") => {
    const { likes, reposts, replies } = makeEngagementPreset(preset);
    setLikeCount(toCountStringOrEmpty(likes));
    setRepostCount(toCountStringOrEmpty(reposts));
    setReplyCount(toCountStringOrEmpty(replies));
  }, []);

  // relations
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [quoteId, setQuoteId] = useState<string | undefined>(undefined);
  const [insertedAt, setInsertedAt] = useState<string>(""); // preserve in edit

  const quotedPost = useMemo(() => {
    if (!quoteId) return null;
    return getPostById(String(quoteId));
  }, [quoteId, getPostById]);

  const scenarioProfileIds = useMemo(() => {
    return new Set(listProfilesForScenario(sid).map((p) => String(p.id)));
  }, [sid, listProfilesForScenario]);

  // hydration
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isReady) return;

    const replyParent = parentPostId ? String(parentPostId) : undefined;
    const q = quotedPostId ? String(quotedPostId) : undefined;

    if (!isEdit) {
      setAuthorProfileId((prev) => prev ?? initialAuthorId ?? null);
      setParentId(replyParent);
      setQuoteId(q);

      // campaign defaults
      setPostType("rp");
      setMeta(undefined);

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
      setImageUrls(uniqueLimit(raw, MAX_IMAGES));
    }

    setReplyCount(toCountStringOrEmpty(clampInt(found.replyCount ?? 0, 0, MAX_COUNT)));
    setRepostCount(toCountStringOrEmpty(clampInt(found.repostCount ?? 0, 0, MAX_COUNT)));
    setLikeCount(toCountStringOrEmpty(clampInt(found.likeCount ?? 0, 0, MAX_COUNT)));

    setParentId(found.parentPostId ? String(found.parentPostId) : replyParent);
    setQuoteId(found.quotedPostId ? String(found.quotedPostId) : q);

    setInsertedAt((found as any).insertedAt ?? found.createdAt ?? new Date().toISOString());

    // campaign hydration
    setPostType(((found as any)?.postType as PostType) || "rp");
    setMeta((found as any)?.meta);

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

  // if scenario is not campaign, force rp + clear meta
  useEffect(() => {
    if (!isReady) return;
    if (isCampaign) return;
    if (postType !== "rp") setPostType("rp");
    if (meta) setMeta(undefined);
  }, [isReady, isCampaign]); // intentionally not depending on postType/meta

  // author selection callback after coming back from select-profile
  useEffect(() => {
    if (!isReady) return;
    if (!pickAuthorArmed) return;
    if (!selectedId) return;

    if (pickAuthorPrevSelectedId && String(selectedId) === String(pickAuthorPrevSelectedId)) {
      return;
    }

    setAuthorProfileId(String(selectedId));
    setPickAuthorArmed(false);
    setPickAuthorPrevSelectedId(null);
  }, [isReady, pickAuthorArmed, selectedId, pickAuthorPrevSelectedId]);

  // fallback: if author missing, assign one
  useEffect(() => {
    if (!isReady) return;
    if (authorProfileId) return;

    const next = selectedId ?? fallbackOwnedProfileId;
    if (next) setAuthorProfileId(String(next));
  }, [isReady, authorProfileId, selectedId, fallbackOwnedProfileId]);

  // create-mode: keep selectedProfileId in sync with author (NOT in edit)
  useEffect(() => {
    if (!isReady) return;
    if (isEdit) return;
    if (!authorProfileId) return;
    if (selectedId === authorProfileId) return;

    setSelectedProfileId(sid, String(authorProfileId)).catch(() => {});
  }, [isReady, isEdit, sid, authorProfileId, selectedId, setSelectedProfileId]);

  const canPost =
    Boolean(authorProfileId) &&
    threadTexts.length > 0 &&
    threadTexts.every((t) => isTruthyText(t));

  const buildSafeCounts = useCallback(() => {
    return {
      reply: clampInt(counts.reply, 0, MAX_COUNT),
      repost: clampInt(counts.repost, 0, MAX_COUNT),
      like: clampInt(counts.like, 0, MAX_COUNT),
    };
  }, [counts]);

  const ensureAuthorValid = useCallback(() => {
    const safeAuthorId = String(authorProfileId ?? "");
    if (!safeAuthorId) return null;

    if (!scenarioProfileIds.has(safeAuthorId)) {
      Alert.alert("Invalid author", "Pick a valid profile for this scenario.");
      return null;
    }

    return safeAuthorId;
  }, [authorProfileId, scenarioProfileIds]);

  const onPost = useCallback(async () => {
    if (!canPost) return;

    const safeAuthorId = ensureAuthorValid();
    if (!safeAuthorId) return;

    const safeCounts = buildSafeCounts();

    const { imageUrls: postImageUrls, addVideoIconForPost } = mediaForPost({
      imageUrls,
      videoThumbUri,
      addVideoIcon,
    });

    const savedPostType = isCampaign && postType !== "rp" ? postType : undefined;
    const savedMeta = isCampaign ? meta : undefined;

    const isStandaloneCreate = !isEdit && !parentId && !quoteId;

    // EDIT: single post only (no thread)
    if (isEdit) {
      const base: Post & { addVideoIcon?: boolean; insertedAt?: string } = {
        id: editingPostId,
        scenarioId: sid,
        authorProfileId: safeAuthorId,
        text: (threadTexts[0] ?? "").trim(),
        createdAt: date.toISOString(),
        imageUrls: postImageUrls,
        replyCount: safeCounts.reply,
        repostCount: safeCounts.repost,
        likeCount: safeCounts.like,
        parentPostId: parentId,
        quotedPostId: quoteId,
        insertedAt: insertedAt || new Date().toISOString(),
        addVideoIcon: addVideoIconForPost,

        postType: savedPostType as any,
        meta: savedMeta,
      };

      await upsertPost(base as any);
      router.back();
      return;
    }

    // CREATE: reply/quote => single post
    if (!isStandaloneCreate) {
      const postedAtIso = new Date().toISOString();

      const base: Post & { addVideoIcon?: boolean; insertedAt?: string } = {
        id: makeId("po"),
        scenarioId: sid,
        authorProfileId: safeAuthorId,
        text: (threadTexts[0] ?? "").trim(),
        createdAt: postedAtIso,
        imageUrls: postImageUrls,
        replyCount: safeCounts.reply,
        repostCount: safeCounts.repost,
        likeCount: safeCounts.like,
        parentPostId: parentId,
        quotedPostId: quoteId,
        insertedAt: postedAtIso,
        addVideoIcon: addVideoIconForPost,

        postType: savedPostType as any,
        meta: savedMeta,
      };

      await upsertPost(base as any);
      await setSelectedProfileId(sid, safeAuthorId);
      router.back();
      return;
    }

    // CREATE: thread => chain as replies
    const baseTime = new Date();
    const insertedAtBaseIso = baseTime.toISOString();
    let prevId: string | undefined;

    for (let i = 0; i < threadTexts.length; i++) {
      const id = makeId("po");
      const createdAt = new Date(baseTime.getTime() + i * 1000).toISOString();

      const post: Post & { addVideoIcon?: boolean; insertedAt?: string } = {
        id,
        scenarioId: sid,
        authorProfileId: safeAuthorId,
        text: threadTexts[i].trim(),
        createdAt,
        imageUrls: i === 0 ? postImageUrls : [],
        replyCount: i === 0 ? safeCounts.reply : 0,
        repostCount: i === 0 ? safeCounts.repost : 0,
        likeCount: i === 0 ? safeCounts.like : 0,
        parentPostId: i === 0 ? undefined : prevId,
        quotedPostId: undefined,
        insertedAt: insertedAtBaseIso,
        addVideoIcon: i === 0 ? addVideoIconForPost : false,

        // only on the first thread item
        postType: i === 0 ? (savedPostType as any) : undefined,
        meta: i === 0 ? savedMeta : undefined,
      };

      await upsertPost(post as any);
      prevId = id;
    }

    await setSelectedProfileId(sid, safeAuthorId);
    router.back();
  }, [
    canPost,
    ensureAuthorValid,
    buildSafeCounts,
    imageUrls,
    videoThumbUri,
    addVideoIcon,
    isEdit,
    editingPostId,
    sid,
    threadTexts,
    date,
    parentId,
    quoteId,
    insertedAt,
    upsertPost,
    setSelectedProfileId,
    isCampaign,
    postType,
    meta,
  ]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        {picking ? (
          <View style={styles.overlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          <CreatePostHeader
            colors={colors}
            isEdit={isEdit}
            canPost={canPost}
            onCancel={() => router.back()}
            onSubmit={onPost}
          />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            <View style={styles.composer}>
              <AuthorAvatarPicker
                colors={colors}
                avatarUrl={profile?.avatarUrl}
                onPress={() => {
                  setPickAuthorArmed(true);
                  setPickAuthorPrevSelectedId(selectedId ? String(selectedId) : "");
                  router.push({
                    pathname: "/modal/select-profile",
                    params: { scenarioId: sid },
                  } as any);
                }}
              />

              <View style={{ flex: 1 }}>
                <ThreadComposer
                  colors={colors}
                  isEdit={isEdit}
                  parentId={parentId}
                  quoteId={quoteId}
                  threadTexts={threadTexts}
                  focusedThreadIndex={focusedThreadIndex}
                  setFocusedThreadIndex={setFocusedThreadIndex}
                  onChangeThreadTextAt={setThreadTextAt}
                  onAddThreadItem={addThreadItem}
                  onRemoveThreadItem={removeThreadItem}
                />

                <MediaPreview
                  colors={colors}
                  imageUrls={imageUrls}
                  videoThumbUri={videoThumbUri}
                  addVideoIcon={addVideoIcon}
                  onClearMedia={clearMedia}
                  onRemoveImageAt={removeImageAt}
                />

                {quotedPost ? (
                  <View style={{ marginTop: 12 }}>
                    <QuotedPostCard
                      quotedPost={quotedPost}
                      colors={colors}
                      getProfileById={getProfileById}
                      scenarioId={sid}
                    />
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.softDivider, { backgroundColor: colors.border }]} />

            
            <ComposerToolbar
              colors={colors}
              onTakePhoto={takePhoto}
              onPickImages={pickImages}
              onPickVideoThumb={pickVideoThumb}
            />

            {/* Campaign */}
                {isCampaign ? (
                  <View style={{ marginLeft: 20, marginRight: 20, gap: 10 }}>
                    <RowCard label="Post type" colors={colors}>
                      <PostTypePicker
                        colors={colors}
                        value={postType}
                        onChange={(t) => {
                          setPostType(t);
                          // optional: reset meta when switching types
                          setMeta(undefined);
                        }}
                      />
                    </RowCard>

                    {/* Drop your specific composers here later.
                       They should call setMeta(...) as user fills fields. */}
                    {/* {postType === "roll" ? <RollComposer colors={colors} value={meta} onChange={setMeta} /> : null}
                    {postType === "quest" ? <QuestComposer colors={colors} value={meta} onChange={setMeta} /> : null}
                    {postType === "combat" ? <CombatComposer colors={colors} value={meta} onChange={setMeta} /> : null}
                    {postType === "gm" ? <GMComposer colors={colors} value={meta} onChange={setMeta} /> : null}
                    {postType === "log" ? <LogComposer colors={colors} value={meta} onChange={setMeta} /> : null} */}
                  </View>
                ) : null}

            <PostSettingsSection
              colors={colors}
              date={date}
              onOpenPicker={openPicker}
              showDatePicker={showDatePicker}
              pickerMode={pickerMode}
              onAndroidPickerChange={(selected) => {
                setShowDatePicker(false);
                if (selected) setDate(selected);
              }}
              counts={counts}
              replyCount={replyCount}
              repostCount={repostCount}
              likeCount={likeCount}
              onChangeReplyCount={(v) => setReplyCount(limitCountText(v))}
              onChangeRepostCount={(v) => setRepostCount(limitCountText(v))}
              onChangeLikeCount={(v) => setLikeCount(limitCountText(v))}
              onPresetFew={() => setEngagementPreset("few")}
              onPresetMid={() => setEngagementPreset("mid")}
              onPresetLot={() => setEngagementPreset("lot")}
            />
          </ScrollView>

          <DateTimePickerOverlay
            colors={colors}
            visible={showDatePicker}
            mode={pickerMode}
            value={date}
            onChange={setDate}
            onClose={closePicker}
          />
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  composer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  softDivider: { height: StyleSheet.hairlineWidth, opacity: 0.9 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
});