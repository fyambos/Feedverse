import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import type { Post, CharacterSheet } from "@/data/db/schema";
import { markScenarioFeedRefreshNeeded, useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";
import { Alert } from "@/context/dialog";

import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";
import { takeAndPersistPhoto } from "@/lib/media/takePicture";
import { makeId } from "@/lib/utils/format";
import { formatErrorMessage } from "@/lib/utils/format";
import { clearDraft, loadDraft, makeDraftKey, saveDraft } from "@/lib/drafts";

import {
  clampCountFromText,
  clampInt,
  limitCountText,
  makeEngagementPreset,
  MAX_COUNT,
  randInt,
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
import { DiceRollOverlay } from "@/components/postComposer/DiceRollOverlay";

import { RowCard } from "@/components/ui/RowCard";
import type { PostType } from "@/lib/campaign/postTypes";
import type { SheetListItem } from "@/components/postComposer/UseSheetListPicker";

const LazyPostTypePicker = React.lazy(async () => {
  const mod = await import("@/components/postComposer/PostTypePicker");
  return { default: mod.PostTypePicker };
});

const LazyUseSheetListPicker = React.lazy(async () => {
  const mod = await import("@/components/postComposer/UseSheetListPicker");
  return { default: mod.UseSheetListPicker };
});

type Params = {
  scenarioId: string;
  postId?: string;
  parentPostId?: string;
  quotedPostId?: string;
  draftKey?: string;
};

function isTruthyText(s: string) {
  return (s ?? "").trim().length > 0;
}

function norm(s: any) {
  return String(s ?? "").trim();
}

function buildUsedItemsLine(names: string[]) {
  const uniq = Array.from(new Set(names.map((n) => norm(n)).filter(Boolean)));
  if (!uniq.length) return "";
  return `🎒 used: ${uniq.join(", ")}`;
}

function buildUsedListLine(prefixEmoji: string, label: string, names: string[]) {
  const uniq = Array.from(new Set(names.map((n) => norm(n)).filter(Boolean)));
  if (!uniq.length) return "";
  return `${prefixEmoji} ${label}: ${uniq.join(", ")}`;
}

/**
 * Consume selected items from inventory:
 * - if qty exists: qty-- ; if 0 => remove; if 1 => keep but remove qty (qty undefined)
 * - if qty missing: remove (single-use)
 */
function consumeInventory(inventory: SheetListItem[], selectedIds: string[]) {
  const pick = new Set((selectedIds ?? []).map(String));
  const next: SheetListItem[] = [];

  for (const it of Array.isArray(inventory) ? inventory : []) {
    const id = String(it?.id ?? "");
    if (!id) continue;

    if (!pick.has(id)) {
      next.push(it);
      continue;
    }

    // selected
    const q = typeof it.qty === "number" ? Math.max(0, Math.floor(it.qty)) : undefined;

    if (q == null) {
      // no qty -> consume whole item
      continue;
    }

    const newQty = q - 1;
    if (newQty <= 0) {
      continue; // remove
    }

    if (newQty === 1) {
      // keep one left, but remove qty per your rule
      next.push({ ...it, qty: undefined });
      continue;
    }

    // still multiple left
    next.push({ ...it, qty: newQty });
  }

  return next;
}

export default function CreatePostModal() {
  const { scenarioId, postId, parentPostId, quotedPostId, draftKey: draftKeyParam } = useLocalSearchParams<Params>();
  const navigation = useNavigation();

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

    // NEW: inventory comes from character sheet
    getCharacterSheetByProfileId,
    upsertCharacterSheet,
  } = useAppData() as any;

  const scenario = useMemo(() => getScenarioById?.(sid) ?? null, [sid, getScenarioById]);
  const isCampaign = scenario?.mode === "campaign";

  // campaign state
  const [postType, setPostType] = useState<PostType>("rp");
  const [meta, setMeta] = useState<any>(undefined);
  // When using items, we force the next created post to be a campaign "log" even if state hasn't flushed yet.
  const forceLogForUsedItemsRef = React.useRef(false);

  const selectedId = getSelectedProfileId(sid);

  const fallbackOwnedProfileId = useMemo(() => {
    const mine = listProfilesForScenario(sid).find((p: any) => String(p.ownerUserId) === String(userId ?? ""));
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

  // -------------------------
  // Inventory (create-only)
  // -------------------------
  const sheet: CharacterSheet | null = useMemo(() => {
    if (!authorProfileId) return null;
    return getCharacterSheetByProfileId?.(String(authorProfileId)) ?? null;
  }, [authorProfileId, getCharacterSheetByProfileId]);

  const [inventory, setInventory] = useState<SheetListItem[]>([]);
  const [equipment, setEquipment] = useState<SheetListItem[]>([]);
  const [spells, setSpells] = useState<SheetListItem[]>([]);
  const [abilities, setAbilities] = useState<SheetListItem[]>([]);

  useEffect(() => {
    const inv = Array.isArray((sheet as any)?.inventory) ? ((sheet as any).inventory as SheetListItem[]) : [];
    setInventory(inv);

    const eq = Array.isArray((sheet as any)?.equipment) ? ((sheet as any).equipment as SheetListItem[]) : [];
    setEquipment(eq);

    const sp = Array.isArray((sheet as any)?.spells) ? ((sheet as any).spells as SheetListItem[]) : [];
    setSpells(sp);

    const ab = Array.isArray((sheet as any)?.abilities) ? ((sheet as any).abilities as SheetListItem[]) : [];
    setAbilities(ab);
  }, [sheet]);

  const appendLineToFirstPost = useCallback((line: string) => {
    if (!line) return;
    setThreadTexts((prev) => {
      const next = [...prev];
      const base = (next[0] ?? "").trimEnd();
      next[0] = base.length ? `${base}\n\n${line}` : line;
      return next;
    });
  }, []);

  const applyUsedItems = useCallback(
    async (selectedIds: string[]) => {
      if (isEdit) return; // create-only
      if (!selectedIds?.length) return;

      const picked = inventory.filter((it) => selectedIds.includes(String(it.id)));
      const pickedNames = picked.map((it) => it.name);

      // 1) append recap line to first tweet
      const line = buildUsedItemsLine(pickedNames);
      appendLineToFirstPost(line);

      // Make the resulting post a LOG (campaign-only).
      // Use a ref so it applies immediately even if the user posts before state flushes.
      if (isCampaign) {
        forceLogForUsedItemsRef.current = true;
        setPostType("log");
      }

      // 2) consume inventory locally + persist to sheet
      const nextInv = consumeInventory(inventory, selectedIds);
      setInventory(nextInv);

      if (!sheet) return;

      try {
        const nextSheet: CharacterSheet = {
          ...(sheet as any),
          inventory: nextInv as any,
          updatedAt: new Date().toISOString(),
        };

        await upsertCharacterSheet(nextSheet);
      } catch {
        // keep UX smooth; if persistence fails, user can still post
      }
    },
    [isEdit, inventory, sheet, upsertCharacterSheet, isCampaign, setPostType, appendLineToFirstPost]
  );

  const applyUsedEquipment = useCallback(
    async (selectedIds: string[]) => {
      if (isEdit) return;
      if (!selectedIds?.length) return;
      const picked = equipment.filter((it) => selectedIds.includes(String(it.id)));
      appendLineToFirstPost(buildUsedListLine("🛡️", "equipped", picked.map((it) => it.name)));

      if (isCampaign) {
        forceLogForUsedItemsRef.current = true;
        setPostType("log");
      }
    },
    [isEdit, equipment, appendLineToFirstPost, isCampaign, setPostType]
  );

  const applyUsedSpells = useCallback(
    async (selectedIds: string[]) => {
      if (isEdit) return;
      if (!selectedIds?.length) return;
      const picked = spells.filter((it) => selectedIds.includes(String(it.id)));
      appendLineToFirstPost(buildUsedListLine("✨", "cast", picked.map((it) => it.name)));

      if (isCampaign) {
        forceLogForUsedItemsRef.current = true;
        setPostType("log");
      }
    },
    [isEdit, spells, appendLineToFirstPost, isCampaign, setPostType]
  );

  const applyUsedAbilities = useCallback(
    async (selectedIds: string[]) => {
      if (isEdit) return;
      if (!selectedIds?.length) return;
      const picked = abilities.filter((it) => selectedIds.includes(String(it.id)));
      appendLineToFirstPost(buildUsedListLine("🧠", "used", picked.map((it) => it.name)));

      if (isCampaign) {
        forceLogForUsedItemsRef.current = true;
        setPostType("log");
      }
    },
    [isEdit, abilities, appendLineToFirstPost, isCampaign, setPostType]
  );

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
  const [posting, setPosting] = useState(false);
  const [postingRoll, setPostingRoll] = useState<number | null>(null);

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

  type PostDraftV1 = {
    version: 1;
    scenarioId: string;
    authorProfileId: string | null;
    parentPostId?: string | null;
    quotedPostId?: string | null;
    threadTexts: string[];
    imageUrls: string[];
    videoThumbUri: string | null;
    addVideoIcon: boolean;
    postType?: PostType;
    meta?: any;
    savedAt: string;
  };

  function newDraftId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const autosaveDraftKey = useMemo(() => {
    if (!sid || isEdit) return null;
    const replyParent = parentPostId ? String(parentPostId) : "";
    const q = quotedPostId ? String(quotedPostId) : "";
    return makeDraftKey("post", {
      scenarioId: sid,
      parentPostId: replyParent,
      quotedPostId: q,
      autosave: "1",
    });
  }, [sid, isEdit, parentPostId, quotedPostId]);

  const activeDraftKey = useMemo(() => {
    if (isEdit) return null;
    const explicit = String(draftKeyParam ?? "").trim();
    return explicit || autosaveDraftKey;
  }, [isEdit, draftKeyParam, autosaveDraftKey]);

  const hasDraftContent = useMemo(() => {
    if (isEdit) return false;
    const hasText = Array.isArray(threadTexts) && threadTexts.some((t) => String(t ?? "").trim().length > 0);
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    const hasVideo = Boolean(String(videoThumbUri ?? "").trim());
    return hasText || hasImages || hasVideo;
  }, [isEdit, threadTexts, imageUrls, videoThumbUri]);

  const draftPausedRef = React.useRef(false);
  const bypassDiscardConfirmRef = React.useRef(false);
  const draftSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didRestoreDraftRef = React.useRef(false);

  const flushDraftNow = useCallback(async () => {
    if (!activeDraftKey) return;
    if (isEdit) return;

    // Save as a new, unique draft so it doesn't auto-open next time.
    const savedKey = makeDraftKey("post", {
      scenarioId: sid,
      draftId: newDraftId(),
      parentPostId: parentId ? String(parentId) : "",
      quotedPostId: quoteId ? String(quoteId) : "",
    });

    draftPausedRef.current = true;

    const payload: PostDraftV1 = {
      version: 1,
      scenarioId: sid,
      authorProfileId: authorProfileId ? String(authorProfileId) : null,
      parentPostId: parentId ? String(parentId) : null,
      quotedPostId: quoteId ? String(quoteId) : null,
      threadTexts: Array.isArray(threadTexts) ? threadTexts.map(String) : [""],
      imageUrls: Array.isArray(imageUrls) ? imageUrls.map(String).filter(Boolean) : [],
      videoThumbUri: videoThumbUri ? String(videoThumbUri) : null,
      addVideoIcon: Boolean(addVideoIcon),
      postType: isCampaign ? ((postType as any) || "rp") : undefined,
      meta: isCampaign ? meta : undefined,
      savedAt: new Date().toISOString(),
    };

    await saveDraft(savedKey, payload);

    // Clear autosave so reopening the composer is blank.
    if (autosaveDraftKey) {
      try {
        await clearDraft(autosaveDraftKey);
      } catch {
        // ignore
      }
    }
  }, [activeDraftKey, isEdit, sid, authorProfileId, parentId, quoteId, threadTexts, imageUrls, videoThumbUri, addVideoIcon, isCampaign, postType, meta, autosaveDraftKey]);

  // Restore draft on open (create-only)
  useEffect(() => {
    if (!activeDraftKey) return;
    if (!isReady) return;

    let cancelled = false;
    (async () => {
      try {
        const d = await loadDraft<PostDraftV1>(activeDraftKey);
        if (!d || cancelled) return;
        if (d.version !== 1) return;

        // Only restore on create. For edits, the post hydration should win.
        if (isEdit) return;

        const nextTexts = Array.isArray(d.threadTexts) && d.threadTexts.length ? d.threadTexts.map(String) : [""];
        setThreadTexts(nextTexts);
        setImageUrls(Array.isArray(d.imageUrls) ? d.imageUrls.map(String).filter(Boolean) : []);
        setVideoThumbUri(d.videoThumbUri ? String(d.videoThumbUri) : null);
        setAddVideoIcon(Boolean(d.addVideoIcon));

        didRestoreDraftRef.current = true;

        if (typeof d.authorProfileId === "string" && d.authorProfileId.trim()) {
          setAuthorProfileId(String(d.authorProfileId));
        }

        if (isCampaign && d.postType) setPostType(d.postType);
        if (isCampaign && d.meta !== undefined) setMeta(d.meta);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDraftKey, isReady, isEdit, isCampaign]);

  // Autosave draft while composing (create-only)
  useEffect(() => {
    if (!activeDraftKey) return;
    if (!isReady) return;
    if (isEdit) return;
    if (draftPausedRef.current) return;

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);

    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;

      if (!hasDraftContent) {
        // Only clear autosave drafts automatically.
        if (autosaveDraftKey && activeDraftKey === autosaveDraftKey) {
          void clearDraft(autosaveDraftKey);
        }
        return;
      }

      const payload: PostDraftV1 = {
        version: 1,
        scenarioId: sid,
        authorProfileId: authorProfileId ? String(authorProfileId) : null,
        parentPostId: parentId ? String(parentId) : null,
        quotedPostId: quoteId ? String(quoteId) : null,
        threadTexts: Array.isArray(threadTexts) ? threadTexts.map(String) : [""],
        imageUrls: Array.isArray(imageUrls) ? imageUrls.map(String).filter(Boolean) : [],
        videoThumbUri: videoThumbUri ? String(videoThumbUri) : null,
        addVideoIcon: Boolean(addVideoIcon),
        postType: isCampaign ? ((postType as any) || "rp") : undefined,
        meta: isCampaign ? meta : undefined,
        savedAt: new Date().toISOString(),
      };

      void saveDraft(activeDraftKey, payload);
    }, 650);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [activeDraftKey, autosaveDraftKey, isReady, isEdit, hasDraftContent, sid, authorProfileId, parentId, quoteId, threadTexts, imageUrls, videoThumbUri, addVideoIcon, isCampaign, postType, meta]);

  // Confirm discard when leaving composer with a draft
  useEffect(() => {
    const nav: any = navigation as any;
    if (!nav?.addListener) return;

    const unsub = nav.addListener("beforeRemove", (e: any) => {
      if (bypassDiscardConfirmRef.current) return;
      if (!activeDraftKey) return;
      if (isEdit) return;
      if (!hasDraftContent) return;

      e.preventDefault();

      Alert.alert("Discard draft?", "You have an unfinished post.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save draft",
          onPress: () => {
            bypassDiscardConfirmRef.current = true;
            void flushDraftNow().finally(() => {
              try {
                nav.dispatch(e.data.action);
              } catch {
                try {
                  router.back();
                } catch {}
              }
            });
          },
        },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            bypassDiscardConfirmRef.current = true;
            // Discard should clear autosave (and the opened draft if we explicitly opened one).
            const toClear = [activeDraftKey, autosaveDraftKey].filter(Boolean) as string[];
            const unique = Array.from(new Set(toClear));
            void Promise.all(unique.map((k) => clearDraft(k))).finally(() => {
              try {
                nav.dispatch(e.data.action);
              } catch {
                try {
                  router.back();
                } catch {}
              }
            });
          },
        },
      ]);
    });

    return unsub;
  }, [navigation, activeDraftKey, autosaveDraftKey, isEdit, hasDraftContent, flushDraftNow]);

  const quotedPost = useMemo(() => {
    if (!quoteId) return null;
    return getPostById(String(quoteId));
  }, [quoteId, getPostById]);

  const scenarioProfileIds = useMemo(() => {
    return new Set(listProfilesForScenario(sid).map((p: any) => String(p.id)));
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

      // campaign defaults (only if no draft restored)
      if (!didRestoreDraftRef.current) {
        setPostType("rp");
        setMeta(undefined);
      }

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

  // On open/focus (create only): always start from RP post type.
  // This avoids re-opening the modal with a previous type (e.g. after using items => log).
  useFocusEffect(
    useCallback(() => {
      if (!isReady) return;
      if (isEdit) return;

      // If we restored a draft, don't stomp the user's draft state.
      if (didRestoreDraftRef.current) return;
      if (hasDraftContent) return;

      // reset to defaults on create modal open
      setPostType("rp");
      setMeta(undefined);
      forceLogForUsedItemsRef.current = false;
    }, [isReady, isEdit, hasDraftContent])
  );

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

  const canPost = (() => {
    if (posting) return false;
    if (picking) return false;
    if (!authorProfileId) return false;
    if (threadTexts.length === 0) return false;

    const hasMedia = (imageUrls?.length ?? 0) > 0 || Boolean(videoThumbUri);
    const firstOk = isTruthyText(threadTexts[0]);
    const restOk = threadTexts.slice(1).every((t) => isTruthyText(t));

    // Allow: text-only, image-only (first item empty), or mixed.
    // For threads: subsequent items must still have text.
    return (firstOk || hasMedia) && restOk;
  })();

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
    if (posting) return;

    const safeAuthorId = ensureAuthorValid();
    if (!safeAuthorId) return;

    const safeCounts = buildSafeCounts();

    const { imageUrls: postImageUrls, addVideoIconForPost } = mediaForPost({
      imageUrls,
      videoThumbUri,
      addVideoIcon,
    });

    const forcedLog = isCampaign && forceLogForUsedItemsRef.current;

    // Ensure we always have a concrete post type (never undefined).
    // Default is "rp".
    const safeStatePostType: PostType = (postType as any) || "rp";
    const effectivePostType: PostType = forcedLog ? "log" : safeStatePostType;

    // Always persist a postType so posts never end up with "no type".
    // Meta remains campaign-only.
    const savedPostType: PostType = effectivePostType;
    const savedMeta = isCampaign ? meta : undefined;

    const isRollCreate = Boolean(!isEdit && isCampaign && savedPostType === "roll");
    const d20 = isRollCreate ? randInt(1, 20) : null;
    const rollLine = d20 ? `\n\n🎲 d20 → ${d20}` : "";

    // Fancy local "spinner" for roll posts.
    const minFxMs = isRollCreate ? 700 : 0;
    let fxPromise: Promise<void> | null = null;
    if (isRollCreate && d20) {
      setPostingRoll(d20);
      setPosting(true);
      fxPromise = sleep(minFxMs);
    } else {
      setPosting(true);
    }

    const isStandaloneCreate = !isEdit && !parentId && !quoteId;

    try {
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
        markScenarioFeedRefreshNeeded(sid);
        router.back();
        return;
      }

      // CREATE: reply/quote => single post
      if (!isStandaloneCreate) {
        const postedAtIso = date.toISOString();

        const baseText = (threadTexts[0] ?? "").trim();
        const text = savedPostType === "roll" ? `${baseText}${rollLine}` : baseText;

        const base: Post & { addVideoIcon?: boolean; insertedAt?: string } = {
          id: makeId("po"),
          scenarioId: sid,
          authorProfileId: safeAuthorId,
          text,
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
        if (fxPromise) await fxPromise;
        markScenarioFeedRefreshNeeded(sid);

        // success: clear autosave and/or opened draft, then allow leaving
        {
          const toClear = [activeDraftKey, autosaveDraftKey].filter(Boolean) as string[];
          const unique = Array.from(new Set(toClear));
          if (unique.length) {
            bypassDiscardConfirmRef.current = true;
            try {
              await Promise.all(unique.map((k) => clearDraft(k)));
            } catch {}
          }
        }
        router.back();
        return;
      }

      // CREATE: thread => chain as replies
      const baseTime = new Date(date);
      const insertedAtBaseIso = baseTime.toISOString();
      let prevId: string | undefined;

      for (let i = 0; i < threadTexts.length; i++) {
        const id = makeId("po");
        const createdAt = new Date(baseTime.getTime() + i * 1000).toISOString();

        const baseText = threadTexts[i].trim();
        const text = i === 0 && isCampaign && savedPostType === "roll" ? `${baseText}${rollLine}` : baseText;

        const post: Post & { addVideoIcon?: boolean; insertedAt?: string } = {
          id,
          scenarioId: sid,
          authorProfileId: safeAuthorId,
          text,
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
      if (fxPromise) await fxPromise;
      markScenarioFeedRefreshNeeded(sid);

      // success: clear autosave and/or opened draft, then allow leaving
      {
        const toClear = [activeDraftKey, autosaveDraftKey].filter(Boolean) as string[];
        const unique = Array.from(new Set(toClear));
        if (unique.length) {
          bypassDiscardConfirmRef.current = true;
          try {
            await Promise.all(unique.map((k) => clearDraft(k)));
          } catch {}
        }
      }
      router.back();
    } catch (e) {
      Alert.alert(
        isEdit ? "Could not save post" : "Could not post",
        formatErrorMessage(e, "Network error. Please try again.")
      );
    } finally {
      setPosting(false);
      setPostingRoll(null);
      forceLogForUsedItemsRef.current = false;
    }
  }, [
    canPost,
    posting,
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
    activeDraftKey,
    autosaveDraftKey,
  ]);

  const canUseItems = !isEdit && !!authorProfileId && !!sheet && inventory.length > 0;
  const canUseEquipment = !isEdit && !!authorProfileId && !!sheet && equipment.length > 0;
  const canUseSpells = !isEdit && !!authorProfileId && !!sheet && spells.length > 0;
  const canUseAbilities = !isEdit && !!authorProfileId && !!sheet && abilities.length > 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        {posting && postingRoll ? <DiceRollOverlay visible={true} colors={colors as any} finalValue={postingRoll} /> : null}

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
            showDrafts={!isEdit}
            onPressDrafts={() => router.push({ pathname: "/modal/drafts", params: { kind: "post" } } as any)}
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
              leftTools={
                isCampaign ? (
                  <React.Suspense
                    fallback={
                      <View style={{ padding: 8 }}>
                        <ActivityIndicator />
                      </View>
                    }
                  >
                    <>
                      <LazyUseSheetListPicker
                        colors={colors as any}
                        title="use items"
                        subtitle="pick what you’re using this post."
                        items={inventory}
                        disabled={!canUseItems}
                        onConfirm={applyUsedItems}
                        variant="icon"
                        icon="🎒"
                        accessibilityLabel="Use item"
                      />

                      <LazyUseSheetListPicker
                        colors={colors as any}
                        title="use equipment"
                        subtitle="pick what you’re using this post."
                        items={equipment}
                        disabled={!canUseEquipment}
                        onConfirm={applyUsedEquipment}
                        variant="icon"
                        icon="🛡️"
                        accessibilityLabel="Use equipment"
                      />

                      <LazyUseSheetListPicker
                        colors={colors as any}
                        title="use spells"
                        subtitle="pick what you’re using this post."
                        items={spells}
                        disabled={!canUseSpells}
                        onConfirm={applyUsedSpells}
                        variant="icon"
                        icon="✨"
                        accessibilityLabel="Use spells"
                      />

                      <LazyUseSheetListPicker
                        colors={colors as any}
                        title="use abilities"
                        subtitle="pick what you’re using this post."
                        items={abilities}
                        disabled={!canUseAbilities}
                        onConfirm={applyUsedAbilities}
                        variant="icon"
                        icon="🧠"
                        accessibilityLabel="Use abilities"
                      />
                    </>
                  </React.Suspense>
                ) : null
              }
            />

            {/* Campaign */}
            {isCampaign ? (
              <View style={{ marginLeft: 20, marginRight: 20, gap: 10 }}>
                <RowCard label="Post type" colors={colors}>
                  <React.Suspense fallback={<ActivityIndicator />}>
                    <LazyPostTypePicker
                      colors={colors}
                      value={postType}
                      onChange={(t) => {
                        setPostType(t);
                        setMeta(undefined);
                      }}
                    />
                  </React.Suspense>
                </RowCard>
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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