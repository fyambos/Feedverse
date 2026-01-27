// mobile/app/(scenario)/[scenarioId]/(tabs)/messages/[conversationId].tsx

import { setActiveConversation, subscribeToMessageEvents, subscribeToTypingEvents } from "@/context/appData";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/themed-text";
import TypingIndicator from "@/components/ui/TypingIndicator";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";
import { Alert as DialogAlert } from "@/context/dialog";
import type { Conversation, Message, Profile } from "@/data/db/schema";
import { AuthorAvatarPicker } from "@/components/postComposer/AuthorAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { apiFetch } from "@/lib/api/apiClient";
import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Lightbox } from "@/components/media/LightBox";
import { formatChatDayHeader, formatErrorMessage, getLocalDayKey } from "@/lib/utils/format";
import { coerceStringArray } from "@/lib/utils/pgArrays";
import { clearDraft, loadDraft, makeDraftKey, saveDraft } from "@/lib/drafts";

const SEND_BTN_SCALE_DOWN = 0.92;
const SEND_BTN_SCALE_DOWN_MS = 60;
export default function ConversationThreadScreen() {

  // Force re-render when the local DB mutates in-place (common in this appData store).
  const [messageVersion, setMessageVersion] = useState(0);

  const navigation = useNavigation();


  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { scenarioId, conversationId, draftKey: draftKeyParam } = useLocalSearchParams<{
    scenarioId: string;
    conversationId: string;
    draftKey?: string;
  }>();

  const sid = String(scenarioId ?? "");
  const cid = String(conversationId ?? "");

  const app = useAppData() as any;
  const auth = useAuth();
  const {
    isReady,
    db,
    getSelectedProfileId,
    getConversationById,
    getProfileById,
    listSendAsProfilesForScenario,
    sendMessage,
    updateMessage,
    deleteMessage,
    reorderMessagesInConversation,
  } = app;

  const selectedProfileId: string | null = useMemo(
    () => (sid ? (getSelectedProfileId?.(sid) ?? null) : null),
    [sid, getSelectedProfileId]
  );

  const markReadThrottleRef = useRef<{ lastAtMs: number }>({ lastAtMs: 0 });
  const markConversationRead = useCallback(async () => {
    try {
      const token = String(auth?.token ?? "").trim();
      if (!token) return;
      if (!sid || !cid) return;
      if (!selectedProfileId) return;

      const nowMs = Date.now();
      if (nowMs - markReadThrottleRef.current.lastAtMs < 900) return;
      markReadThrottleRef.current.lastAtMs = nowMs;

      await apiFetch({
        path: `/conversations/${encodeURIComponent(String(cid))}/read`,
        token,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: String(selectedProfileId) }),
        },
      });
    } catch {
      // ignore
    }
  }, [auth?.token, sid, cid, selectedProfileId]);

  const reportMessageById = useCallback(
    async (messageId: string, reportText?: string) => {
      try {
        const token = String(auth?.token ?? "").trim();
        if (!token) {
          DialogAlert.alert("Not signed in", "Please sign in to report messages.");
          return;
        }

        const res = await apiFetch({
          path: `/messages/${encodeURIComponent(String(messageId))}/report`,
          token,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: String(reportText ?? "").trim() || undefined }),
          },
        });

        if (!res.ok) {
          DialogAlert.alert("Report failed", res?.json?.error ?? res.text ?? "Please try again.");
          return;
        }

        DialogAlert.alert("Reported", "Thanks — we’ll take a look.");
      } catch {
        DialogAlert.alert("Report failed", "Network error. Please try again.");
      }
    },
    [auth?.token],
  );

  // Track which conversation is currently active (non-reactive; avoids update loops)
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(sid, cid);
      // While viewing this thread, keep it marked read so unread counts don't accumulate.
      void markConversationRead();
      return () => setActiveConversation(sid, null);
    }, [sid, cid, markConversationRead])
  );

  // Live message subscription: append new messages for this conversation
  useEffect(() => {
    if (!sid || !cid) return;
    // Handler for new messages
    const handler = (msg: any) => {
      if (String(msg.scenarioId) === sid && String(msg.conversationId) === cid) {
        // Force a state update by syncing messages for this conversation
        app?.syncMessagesForConversation?.({ scenarioId: sid, conversationId: cid, limit: 200 });
        // If we're currently viewing this thread, immediately mark read.
        void markConversationRead();

        // Also force a render even if the DB store mutates in place.
        setMessageVersion((v) => v + 1);
      }
    };
    const unsubscribe = subscribeToMessageEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [sid, cid, app, markConversationRead]);

  const conversation: Conversation | null = useMemo(
    () => (cid ? (getConversationById?.(cid) ?? null) : null),
    [cid, getConversationById]
  );

  const participantIds: string[] = useMemo(() => {
    const ids = Array.isArray((conversation as any)?.participantProfileIds)
      ? (conversation as any).participantProfileIds.map(String).filter(Boolean)
      : [];
    return Array.from(new Set(ids));
  }, [conversation]);

  const isOneToOne = participantIds.length === 2;
  const otherProfileId: string | null = useMemo(() => {
    if (!isOneToOne) return null;
    const me = String(selectedProfileId ?? "");
    return participantIds.find((x) => String(x) !== me) ?? null;
  }, [isOneToOne, participantIds, selectedProfileId]);

  const title = useMemo(() => {
    if (!conversation) return "conversation";
    const custom = String((conversation as any)?.title ?? "").trim();
    if (custom) return custom;
    if (isOneToOne && otherProfileId) {
      const p: Profile | null = getProfileById?.(String(otherProfileId)) ?? null;
      return p?.displayName ? String(p.displayName) : "conversation";
    }
    return "group chat";
  }, [conversation, isOneToOne, otherProfileId, getProfileById]);

  const canEditGroup = !isOneToOne;
  const groupAvatarUrl = String((conversation as any)?.avatarUrl ?? "").trim() || null;

  const headerAvatarUrl: string | null = useMemo(() => {
    if (!conversation) return null;
    if (!isOneToOne) return groupAvatarUrl;
    if (!otherProfileId) return null;
    const p: Profile | null = getProfileById?.(String(otherProfileId)) ?? null;
    return String((p as any)?.avatarUrl ?? "").trim() || null;
  }, [conversation, isOneToOne, groupAvatarUrl, otherProfileId, getProfileById]);

  const onPressHeader = useCallback(() => {
    if (!canEditGroup) return;
    if (!sid || !cid) return;
    router.push({ pathname: "/modal/edit-groupchat", params: { scenarioId: sid, conversationId: cid } } as any);
  }, [canEditGroup, sid, cid]);

  const [text, setText] = useState<string>("");
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [sendAsId, setSendAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ownedOpen, setOwnedOpen] = useState(true);
  const [publicOpen, setPublicOpen] = useState(false);

  const deleteMessageRef = useRef(false);

  const pendingSendRef = useRef<{
    scenarioId: string;
    conversationId: string;
    senderProfileId: string;
    text: string;
    imageUris: string[];
  } | null>(null);
  const didLongPressSendRef = useRef(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  type MessageDraftV1 = {
    version: 1;
    scenarioId: string;
    conversationId: string;
    text: string;
    imageUris: string[];
    sendAsId: string | null;
    savedAt: string;
  };

  const newDraftId = useCallback(() => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const autosaveDraftKey = useMemo(() => {
    if (!sid || !cid) return null;
    return makeDraftKey("message", { scenarioId: sid, conversationId: cid, autosave: "1" });
  }, [sid, cid]);

  const activeDraftKey = useMemo(() => {
    const explicit = String(draftKeyParam ?? "").trim();
    return explicit || autosaveDraftKey;
  }, [draftKeyParam, autosaveDraftKey]);

  const hasDraftContent = useMemo(() => {
    const hasText = String(text ?? "").trim().length > 0;
    const hasImgs = Array.isArray(imageUris) && imageUris.length > 0;
    return hasText || hasImgs;
  }, [text, imageUris]);

  const draftPausedRef = useRef(false);
  const bypassDiscardConfirmRef = useRef(false);
  const restoredForKeyRef = useRef<string | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraftNow = useCallback(async () => {
    if (!activeDraftKey) return;

    // Save as a new, unique draft so it doesn't auto-open next time.
    const savedKey = makeDraftKey("message", { scenarioId: sid, conversationId: cid, draftId: newDraftId() });

    draftPausedRef.current = true;

    const payload: MessageDraftV1 = {
      version: 1,
      scenarioId: sid,
      conversationId: cid,
      text: String(text ?? ""),
      imageUris: Array.isArray(imageUris) ? imageUris.map(String).filter(Boolean) : [],
      sendAsId: sendAsId ? String(sendAsId) : null,
      savedAt: new Date().toISOString(),
    };

    await saveDraft(savedKey, payload);

    // Clear autosave so reopening the thread doesn't restore.
    if (autosaveDraftKey) {
      try {
        await clearDraft(autosaveDraftKey);
      } catch {
        // ignore
      }
    }
  }, [activeDraftKey, autosaveDraftKey, sid, cid, text, imageUris, sendAsId, newDraftId]);

  // Restore draft when opening the conversation
  useEffect(() => {
    if (!isReady) return;
    if (!activeDraftKey) return;
    if (restoredForKeyRef.current === activeDraftKey) return;
    restoredForKeyRef.current = activeDraftKey;

    let cancelled = false;
    (async () => {
      try {
        const d = await loadDraft<MessageDraftV1>(activeDraftKey);
        if (!d || cancelled) return;
        if (d.version !== 1) return;

        // Only restore into an empty composer (avoid stomping user input)
        if (String(text ?? "").trim().length > 0) return;
        if (Array.isArray(imageUris) && imageUris.length > 0) return;

        setText(String(d.text ?? ""));
        setImageUris(Array.isArray(d.imageUris) ? d.imageUris.map(String).filter(Boolean) : []);
        if (typeof d.sendAsId === "string" && d.sendAsId.trim()) {
          setSendAsId(String(d.sendAsId));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isReady, activeDraftKey, text, imageUris]);

  // Autosave draft while typing
  useEffect(() => {
    if (!isReady) return;
    if (!activeDraftKey) return;
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

      const payload: MessageDraftV1 = {
        version: 1,
        scenarioId: sid,
        conversationId: cid,
        text: String(text ?? ""),
        imageUris: Array.isArray(imageUris) ? imageUris.map(String).filter(Boolean) : [],
        sendAsId: sendAsId ? String(sendAsId) : null,
        savedAt: new Date().toISOString(),
      };

      void saveDraft(activeDraftKey, payload);
    }, 550);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [isReady, activeDraftKey, autosaveDraftKey, hasDraftContent, sid, cid, text, imageUris, sendAsId]);

  // Confirm discard when leaving with a draft
  useEffect(() => {
    const nav: any = navigation as any;
    if (!nav?.addListener) return;

    const unsub = nav.addListener("beforeRemove", (e: any) => {
      if (bypassDiscardConfirmRef.current) return;
      if (!activeDraftKey) return;
      if (!hasDraftContent) return;

      e.preventDefault();

      Alert.alert("Discard draft?", "You have an unfinished message.", [
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
  }, [navigation, activeDraftKey, autosaveDraftKey, hasDraftContent, flushDraftNow]);

  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<Message[] | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const lastScrollOffsetRef = useRef(0);
  const reorderEnterOffsetRef = useRef<number | "bottom" | null>(null);
  const didRestoreReorderScrollRef = useRef(false);
  const suppressAutoScrollRef = useRef(false);

  // Pagination (client-side incremental load from local messages map)
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const loadingOlderRef = useRef(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [editSenderId, setEditSenderId] = useState<string | null>(null);
  const [editPublicOpen, setEditPublicOpen] = useState(false);

  const [newMsgCount, setNewMsgCount] = useState<number>(0);
  const [showNewMessages, setShowNewMessages] = useState<boolean>(false);

  // Typing indicator state & timers
  const [typingProfileIds, setTypingProfileIds] = useState<string[]>([]);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const typingSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIsActiveRef = useRef(false);


  // Mark all as read when the thread is opened / focused
  useFocusEffect(
    useCallback(() => {
      if (!isReady || !sid || !cid || !selectedProfileId) return () => void 0;

      (async () => {
        try {
          const token = app?.auth?.token;
          if (!token) return;

          // Backend expects POST with JSON body: { profileId }
          await apiFetch({
            path: `/conversations/${encodeURIComponent(cid)}/read`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profileId: String(selectedProfileId) }),
            },
          });

          // Optional: refresh unread counts / conversation list when going back
          // (inbox screen should refetch on focus too)
        } catch {
          // ignore
        }
      })();

      return () => void 0;
    }, [isReady, sid, cid, selectedProfileId, app])
  );

  // default sender = selected profile ("you"/receiver)
  useEffect(() => {
    if (!sendAsId && selectedProfileId) setSendAsId(String(selectedProfileId));
  }, [sendAsId, selectedProfileId]);

  // if 1:1 and "other" missing, keep sendAs pinned to selected
  useEffect(() => {
    if (!isOneToOne) return;
    if (!selectedProfileId) return;
    if (!otherProfileId) {
      setSendAsId(String(selectedProfileId));
      return;
    }
  }, [isOneToOne, otherProfileId, selectedProfileId]);

  const messagesMap: Record<string, Message> = useMemo(() => ((db as any)?.messages ?? {}) as any, [db, messageVersion]);
  const messageIds: string[] | null = useMemo(() => {
    const ids = (conversation as any)?.messageIds;
    if (!Array.isArray(ids)) return null;
    const out = ids.map(String).map((s: string) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : null;
  }, [conversation]);

  const messages: Message[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid || !cid) return [];

    // Fast path: use per-conversation id index (avoids scanning all messages).
    if (messageIds && messageIds.length > 0) {
      const out: Message[] = [];
      const idSet = new Set(messageIds.map(String));
      for (const mid of messageIds) {
        const m = messagesMap[mid];
        if (!m) continue;
        if (String((m as any).scenarioId) !== sid) continue;
        if (String((m as any).conversationId) !== cid) continue;
        out.push(m);
      }

      // IMPORTANT: preserve optimistic client_* messages even if a sync temporarily
      // replaces conversation.messageIds with server-only IDs.
      const cutoffMs = Date.now() - 10 * 60_000;
      for (const m of Object.values(messagesMap)) {
        const id = String((m as any)?.id ?? "").trim();
        if (!id || idSet.has(id)) continue;
        if (String((m as any).scenarioId) !== sid) continue;
        if (String((m as any).conversationId) !== cid) continue;

        const status = String((m as any)?.clientStatus ?? "").trim();
        const isOptimistic = id.startsWith("client_") || status === "sending" || status === "failed";
        if (!isOptimistic) continue;

        const ms = Date.parse(String((m as any)?.createdAt ?? ""));
        if (Number.isFinite(ms) && ms < cutoffMs) continue;

        out.push(m);
      }

      out.sort((a, b) => {
        const ca = String((a as any).createdAt ?? "");
        const cb = String((b as any).createdAt ?? "");
        if (ca !== cb) return ca.localeCompare(cb);
        return String((a as any).id ?? "").localeCompare(String((b as any).id ?? ""));
      });

      return out;
    }

    const out: Message[] = [];
    for (const m of Object.values(messagesMap)) {
      if (String((m as any).scenarioId) !== sid) continue;
      if (String((m as any).conversationId) !== cid) continue;
      out.push(m);
    }
    out.sort((a, b) => {
      const ca = String((a as any).createdAt ?? "");
      const cb = String((b as any).createdAt ?? "");
      if (ca !== cb) return ca.localeCompare(cb);
      return String((a as any).id ?? "").localeCompare(String((b as any).id ?? ""));
    });
    return out;
  }, [isReady, sid, cid, messagesMap, messageIds, messageVersion]);

  // Messages currently visible in UI (last `visibleCount` messages)
  const visibleMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [] as Message[];
    const start = Math.max(0, messages.length - visibleCount);
    return messages.slice(start);
  }, [messages, visibleCount]);

  // For a chat UX that opens at the bottom instantly, we render the list
  // inverted with newest-first data.
  const visibleMessagesForList = useMemo(() => {
    if (!visibleMessages || visibleMessages.length === 0) return [] as Message[];
    return [...visibleMessages].reverse();
  }, [visibleMessages]);

  // RN's `inverted` implementation differs across platforms:
  // - iOS: effectively flips Y.
  // - Android (RN 0.81+): can flip both axes, which mirrors text and swaps sides.
  // Counter-flip per row accordingly.
  const invertedRowStyle = useMemo(
    () => ({ transform: [Platform.OS === "android" ? ({ scale: -1 } as any) : ({ scaleY: -1 } as any)] }),
    [],
  );

  const listContainerStyle = useMemo(() => ({ flex: 1, minHeight: 0 }), []);
  const listStyle = useMemo(() => ({ flex: 1 }), []);
  const listContentContainerStyle = useMemo(
    () =>
      reorderMode
        ? { padding: 14, paddingBottom: 10, flexGrow: 1, justifyContent: "flex-start" as const }
        : { padding: 14, paddingBottom: 24, flexGrow: 1, justifyContent: "flex-start" as const },
    [reorderMode],
  );

  const keyExtractor = useCallback(
    (m: Message) => String((m as any)?.clientMessageId ?? (m as any)?.client_message_id ?? (m as any)?.id),
    [],
  );

  const listRef = useRef<any>(null);
  const dragListRef = useRef<any>(null);

  // --- scrolling helpers (inverted chat list) ---
  const isNearBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);

  const scrollToBottom = useCallback((animated: boolean) => {
    // In an inverted list, offset 0 is the visual bottom.
    try {
      listRef.current?.scrollToOffset?.({ offset: 0, animated });
    } catch {
      // ignore
    }
  }, []);

  // When the keyboard opens, keep the list pinned to the bottom if the user
  // was already at/near the bottom (normal chat-app behavior).
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = () => {
      if (reorderMode) return;
      if (!isNearBottomRef.current) return;
      // Wait a tick for layout to resize then scroll.
      setTimeout(() => {
        try {
          scrollToBottom(false);
        } catch {}
      }, 0);
    };

    const onHide = () => {
      if (reorderMode) return;
      if (!isNearBottomRef.current) return;
      setTimeout(() => {
        try {
          scrollToBottom(false);
        } catch {}
      }, 0);
    };

    const subShow = Keyboard.addListener(showEvent as any, onShow);
    const subHide = Keyboard.addListener(hideEvent as any, onHide);
    return () => {
      try { subShow?.remove?.(); } catch {}
      try { subHide?.remove?.(); } catch {}
    };
  }, [reorderMode, scrollToBottom]);

  // Load older messages (increase visibleCount).
  // With an inverted list (newest-first), older messages are appended, which
  // doesn't require scroll offset anchoring.
  const loadOlderMessages = useCallback(() => {
    if (loadingOlderRef.current) return;
    if (visibleMessages.length >= messages.length) return;
    loadingOlderRef.current = true;
    const nextCount = Math.min(messages.length, visibleCount + PAGE_SIZE);
    setVisibleCount(nextCount);
    setTimeout(() => {
      loadingOlderRef.current = false;
    }, 140);
  }, [messages.length, visibleMessages.length, visibleCount]);

  const onScrollToIndexFailed = useCallback(() => {
    // Avoid jumping to bottom; we no longer rely on scrollToIndex for paging.
  }, []);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset } = e.nativeEvent;
    // In an inverted list, y=0 is the bottom.
    const nearBottom = Number(contentOffset?.y ?? 0) <= 48;

    try {
      lastScrollOffsetRef.current = Number(contentOffset?.y ?? 0) || 0;
    } catch {}

    isNearBottomRef.current = nearBottom;

    // if user comes back to bottom, clear floater
    if (nearBottom) {
      setShowNewMessages(false);
      setNewMsgCount(0);
    }
  }, []);

  const handleEndReached = useCallback(() => {
    loadOlderMessages();
  }, [loadOlderMessages]);

  const syncOnceRef = useRef<string | null>(null);

  useEffect(() => {
    prevMsgCountRef.current = 0;
    isNearBottomRef.current = true;
    setShowNewMessages(false);
    setNewMsgCount(0);
    setVisibleCount(PAGE_SIZE);
    // No scroll-to-end on open; inverted list renders at bottom instantly.
  }, [sid, cid]);

  useEffect(() => {
    if (!isReady) return;
    if (!sid || !cid) return;

    const key = `${sid}|${cid}`;
    if (syncOnceRef.current === key) return;
    syncOnceRef.current = key;

    (async () => {
      try {
        await app?.syncMessagesForConversation?.({ scenarioId: sid, conversationId: cid, limit: 200 });

        // Ensure this screen re-renders even if the DB store mutates in place.
        setMessageVersion((v) => v + 1);
      } catch {
        // ignore
      }
    })();
  }, [isReady, sid, cid, app]);

  // Subscribe to typing events for this conversation
  useEffect(() => {
    if (!sid || !cid) return () => {};
    const handler = (ev: any) => {
      try {
        if (String(ev?.scenarioId ?? "") !== sid) return;
        if (String(ev?.conversationId ?? "") !== cid) return;
        const pid = String(ev?.profileId ?? "").trim();
        if (!pid) return;
        // ignore self
        if (String(pid) === String(selectedProfileId ?? "")) return;

        if (ev.typing) {
          setTypingProfileIds((prev) => (prev.includes(pid) ? prev : [...prev, pid]));
          if (typingTimersRef.current[pid]) {
            clearTimeout(typingTimersRef.current[pid] as any);
          }
          typingTimersRef.current[pid] = setTimeout(() => {
            setTypingProfileIds((prev) => prev.filter((x) => x !== pid));
            typingTimersRef.current[pid] = null;
          }, 4000);
        } else {
          setTypingProfileIds((prev) => prev.filter((x) => x !== pid));
          if (typingTimersRef.current[pid]) {
            clearTimeout(typingTimersRef.current[pid] as any);
            typingTimersRef.current[pid] = null;
          }
        }
      } catch {
        // ignore
      }
    };

    const unsub = subscribeToTypingEvents(handler);
    return () => {
      try { unsub(); } catch {}
      for (const t of Object.values(typingTimersRef.current)) if (t) clearTimeout(t as any);
      typingTimersRef.current = {};
      setTypingProfileIds([]);
    };
  }, [sid, cid, selectedProfileId]);

  // Composer typing handlers: send start when first typed, and send stop after idle.
  const handleChangeText = useCallback(
    (t: string) => {
      setText(t);
      // Defer side-effects so TextInput state/UI updates immediately (Android is sensitive here).
      void Promise.resolve().then(() => {
        try {
          const pid = String(sendAsId ?? selectedProfileId ?? "").trim();
          if (!sid || !cid || !pid) return;
          if (!typingIsActiveRef.current) {
            typingIsActiveRef.current = true;
            try {
              app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: true });
            } catch {}
          }
          if (typingSendTimeoutRef.current) clearTimeout(typingSendTimeoutRef.current as any);
          typingSendTimeoutRef.current = setTimeout(() => {
            typingIsActiveRef.current = false;
            try {
              app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: false });
            } catch {}
            typingSendTimeoutRef.current = null;
          }, 1500);
        } catch {
          // ignore
        }
      });
    },
    [sid, cid, sendAsId, selectedProfileId, app]
  );

  const handleInputBlur = useCallback(() => {
    try {
      const pid = String(sendAsId ?? selectedProfileId ?? "").trim();
      if (!sid || !cid || !pid) return;
      if (typingSendTimeoutRef.current) {
        clearTimeout(typingSendTimeoutRef.current as any);
        typingSendTimeoutRef.current = null;
      }
      if (typingIsActiveRef.current) {
        typingIsActiveRef.current = false;
        try { app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: false }); } catch {}
      }
    } catch {
      // ignore
    }
  }, [sid, cid, sendAsId, selectedProfileId, app]);

  // Keep messages "live" while this screen is focused.
  // Uses existing backend sync (internally throttled) so it's lightweight.
  useFocusEffect(
    useCallback(() => {
      if (!isReady) return () => void 0;
      if (!sid || !cid) return () => void 0;

      // Ensure realtime WebSocket is established for this scenario.
      // Conversations sync is throttled and is also where WS is opened.
      try {
        void app?.syncConversationsForScenario?.(sid);
      } catch {
        // ignore
      }

      let cancelled = false;

      const tick = async () => {
        if (cancelled) return;
        if (reorderMode) return;
        try {
          await app?.syncMessagesForConversation?.({ scenarioId: sid, conversationId: cid, limit: 200 });
        } catch {
          // ignore
        }
      };

      // immediate sync on focus
      void tick();

      const id = setInterval(() => {
        void tick();
      }, 2500);

      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, [isReady, sid, cid, app, reorderMode])
  );

  // Non-inverted FlatList: open at bottom and keep pinned when user is near bottom
  useEffect(() => {
    if (reorderMode) return;

    const prev = prevMsgCountRef.current;
    const next = messages.length;
    prevMsgCountRef.current = next;

    if (next <= prev) return;

    const added = next - prev;

    // if user isn't near bottom, show floater
    if (!isNearBottomRef.current) {
      setShowNewMessages(true);
      setNewMsgCount((c) => c + added);
      return;
    }

    // if user is near bottom, no floater
    setShowNewMessages(false);
    setNewMsgCount(0);
  }, [messages.length, reorderMode]);

  const typingFooter = useMemo(() => {
    if (reorderMode) return null;
    if (!typingProfileIds || typingProfileIds.length === 0) return null;

    const firstPid = String(typingProfileIds[0] ?? "").trim();
    const firstProfile = firstPid ? ((getProfileById?.(firstPid) as Profile | null) ?? null) : null;
    const showAvatar = !isOneToOne;

    return (
      <View style={[styles.typingRowWrap, invertedRowStyle]}>
        {showAvatar ? (
          <View style={styles.typingRowAvatar}>
            <Avatar
              uri={(firstProfile as any)?.avatarUrl ?? null}
              size={28}
              fallbackColor={colors.border}
            />
          </View>
        ) : null}
        <TypingIndicator names={typingProfileIds.map(String)} variant="thread" />
      </View>
    );
  }, [reorderMode, typingProfileIds, isOneToOne, getProfileById, colors.border, invertedRowStyle]);

  useEffect(() => {
    if (!reorderMode) {
      setReorderDraft(null);
      reorderEnterOffsetRef.current = null;
      didRestoreReorderScrollRef.current = false;
      return;
    }

    // Seed on entry, then when paging loads older messages, merge them into the
    // draft without clobbering the user's current reordered state.
    setReorderDraft((prev) => {
      const nextVisible = Array.isArray(visibleMessagesForList) ? visibleMessagesForList : ([] as Message[]);
      if (!prev || prev.length === 0) return nextVisible;

      const prevIds = new Set(prev.map((m) => String((m as any)?.id ?? "")).filter(Boolean));
      const toAdd: Message[] = [];
      for (const m of nextVisible) {
        const id = String((m as any)?.id ?? "").trim();
        if (!id || prevIds.has(id)) continue;
        toAdd.push(m);
      }

      if (toAdd.length === 0) return prev;

      // In the inverted (newest-first) list, paging adds older messages at the end.
      return [...prev, ...toAdd];
    });
  }, [reorderMode, visibleMessagesForList]);

  const exitReorderMode = useCallback(() => {
    // Keep this lightweight; the list stays mounted.
    setReorderSaving(false);
    setReorderMode(false);
    setReorderDraft(null);
    reorderEnterOffsetRef.current = null;
    didRestoreReorderScrollRef.current = false;

    // Release any temporary suppression.
    suppressAutoScrollRef.current = false;
  }, []);

  const enterReorderMode = useCallback(() => {
    if (reorderMode) return;

    // Do NOT expand from `visibleMessages` to full `messages` here.
    // That transition is what causes the scroll offset to reset to 0 on entry.
    setReorderMode(true);
  }, [reorderMode, visibleCount, messages.length]);

  const onSaveReorder = useCallback(async () => {
    if (!sid || !cid) return;
    if (reorderSaving) return;
    // Reorder only the currently visible slice to avoid scroll jumps.
    // When persisting, merge that reordered slice back into the full local order.
    const sliceForList = reorderDraft ?? visibleMessagesForList;
    // Backend expects chronological ordering (oldest->newest). List data is newest-first.
    const sliceChrono = [...sliceForList].reverse();
    const sliceIds = sliceChrono.map((m) => String((m as any).id)).map((s) => s.trim()).filter(Boolean);
    const fullIds = messages.map((m) => String((m as any).id)).map((s) => s.trim()).filter(Boolean);

    let ids = sliceIds;
    if (fullIds.length >= sliceIds.length && sliceIds.length > 0) {
      const n = sliceIds.length;
      const suffix = fullIds.slice(fullIds.length - n);

      const a = new Set(suffix);
      const b = new Set(sliceIds);
      const sameSet = a.size === b.size && Array.from(a).every((v) => b.has(v));

      if (sameSet) {
        ids = [...fullIds.slice(0, fullIds.length - n), ...sliceIds];
      }
    }

    // De-dupe while preserving order.
    const seen = new Set<string>();
    ids = ids.filter((x) => {
      if (!x) return false;
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });

    if (ids.length < 2) {
      setReorderMode(false);
      return;
    }

    try {
      setReorderSaving(true);
      await reorderMessagesInConversation?.({ scenarioId: sid, conversationId: cid, orderedMessageIds: ids });
      exitReorderMode();
    } catch (e: any) {
      Alert.alert(
        "Could not reorder",
        formatErrorMessage(e, "Could not save message order"),
        [
          { text: "Stay", style: "cancel" },
          { text: "Exit reorder", style: "destructive", onPress: exitReorderMode },
        ],
      );
    } finally {
      setReorderSaving(false);
    }
  }, [sid, cid, reorderDraft, visibleMessagesForList, messages, reorderMessagesInConversation, reorderSaving, exitReorderMode]);

  // Note: we intentionally do NOT auto-scroll when entering reorder mode.
  // Long-press reorder should preserve the user's current scroll position.

  const oneToOneSide: "left" | "right" = useMemo(() => {
    // right = selected profile ("you"), left = other participant
    if (!isOneToOne) return "right";
    const me = String(selectedProfileId ?? "");
    const current = String(sendAsId ?? me);
    return current === me ? "right" : "left";
  }, [isOneToOne, selectedProfileId, sendAsId]);

  const senderSlider = useRef(new Animated.Value(oneToOneSide === "right" ? 1 : 0)).current;
  const sendBtnScale = useRef(new Animated.Value(1)).current;

  const bumpSendBtn = useCallback(() => {
    try {
      sendBtnScale.stopAnimation();
      sendBtnScale.setValue(1);
      Animated.sequence([
        Animated.timing(sendBtnScale, {
          toValue: SEND_BTN_SCALE_DOWN,
          duration: SEND_BTN_SCALE_DOWN_MS,
          useNativeDriver: true,
        }),
        Animated.spring(sendBtnScale, {
          toValue: 1,
          friction: 4,
          tension: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } catch {}
  }, [sendBtnScale]);

  useEffect(() => {
    Animated.timing(senderSlider, {
      toValue: oneToOneSide === "right" ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [oneToOneSide, senderSlider]);

  const candidates = useMemo(() => {
    if (!sid) return { owned: [] as Profile[], public: [] as Profile[] };
    return (listSendAsProfilesForScenario?.(sid) ?? { owned: [], public: [] }) as {
      owned: Profile[];
      public: Profile[];
    };
  }, [sid, listSendAsProfilesForScenario]);

  const sendAsAllowedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of [...(candidates.owned ?? []), ...(candidates.public ?? [])]) {
      const id = String((p as any).id ?? "").trim();
      if (id) ids.add(id);
    }
    return ids;
  }, [candidates]);

  const editAllowedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of [...(candidates.owned ?? []), ...(candidates.public ?? [])]) {
      const id = String((p as any).id ?? "").trim();
      if (id) ids.add(id);
    }
    return ids;
  }, [candidates.owned, candidates.public]);

  const eligibleEditSenders: Profile[] = useMemo(() => {
    const out: Profile[] = [];
    for (const pid of participantIds) {
      const id = String(pid ?? "").trim();
      if (!id) continue;
      if (!editAllowedIds.has(id)) continue;
      const p: Profile | null = getProfileById?.(id) ?? null;
      if (p) out.push(p);
    }
    out.sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
    return out;
  }, [participantIds, editAllowedIds, getProfileById]);

  const eligibleEditSendersOwned: Profile[] = useMemo(() => {
    const ownedIds = new Set((candidates.owned ?? []).map((p) => String((p as any).id ?? "")).filter(Boolean));
    return eligibleEditSenders.filter((p) => ownedIds.has(String((p as any).id ?? "")));
  }, [eligibleEditSenders, candidates.owned]);

  const eligibleEditSendersPublic: Profile[] = useMemo(() => {
    const pubIds = new Set((candidates.public ?? []).map((p) => String((p as any).id ?? "")).filter(Boolean));
    return eligibleEditSenders.filter((p) => pubIds.has(String((p as any).id ?? "")));
  }, [eligibleEditSenders, candidates.public]);

  const openEdit = useCallback(
    (m: Message) => {
      const mid = String((m as any).id ?? "");
      if (!mid) return;

      const senderId = String((m as any).senderProfileId ?? "");
      if (!editAllowedIds.has(senderId)) return;

      setEditMessageId(mid);
      setEditText(String((m as any).text ?? ""));
      setEditSenderId(senderId);
      setEditOpen(true);
    },
    [editAllowedIds]
  );

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditMessageId(null);
    setEditText("");
    setEditSenderId(null);
  }, []);

  const runDeleteMessage = useCallback(
    async (messageId: string, opts?: { after?: () => void }) => {
      if (!sid) return;
      const mid = String(messageId ?? "").trim();
      if (!mid) return;
      if (deleteMessageRef.current) return;
      deleteMessageRef.current = true;

      try {
        await deleteMessage?.({ scenarioId: sid, messageId: mid });
        opts?.after?.();
      } catch (e: any) {
        Alert.alert("Could not delete", formatErrorMessage(e, "Could not delete message"));
      } finally {
        deleteMessageRef.current = false;
      }
    },
    [sid, deleteMessage]
  );

  const onSaveEdit = useCallback(async () => {
    if (!sid) return;
    if (!editMessageId) return;

    const body = String(editText ?? "").trim();
    const from = String(editSenderId ?? "").trim();
    if (!body) return;
    if (!from) return;
    if (!editAllowedIds.has(from)) return;

    try {
      await updateMessage?.({
        scenarioId: sid,
        messageId: String(editMessageId),
        text: body,
        senderProfileId: from,
      });
      closeEdit();
    } catch (e: any) {
      Alert.alert("Could not update", formatErrorMessage(e, "Could not update message"));
    }
  }, [sid, editMessageId, editText, editSenderId, editAllowedIds, updateMessage, closeEdit]);

  const onDeleteEdit = useCallback(async () => {
    if (!sid) return;
    if (!editMessageId) return;

    const mid = String(editMessageId);

    Alert.alert("Delete message?", "This will remove the message.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await runDeleteMessage(mid, { after: closeEdit });
        },
      },
    ]);
  }, [sid, editMessageId, runDeleteMessage, closeEdit]);

  const canSwitchOneToOneSender = useMemo(() => {
    if (!isOneToOne) return false;
    if (!otherProfileId) return false;

    const allowed = new Set(
      [...(candidates.owned ?? []), ...(candidates.public ?? [])]
        .map((p) => String((p as any).id ?? ""))
        .filter(Boolean)
    );

    return allowed.has(String(otherProfileId));
  }, [isOneToOne, otherProfileId, candidates]);

  useEffect(() => {
    if (!isOneToOne) return;
    if (!selectedProfileId) return;
    if (canSwitchOneToOneSender) return;
    setSendAsId(String(selectedProfileId));
  }, [isOneToOne, selectedProfileId, canSwitchOneToOneSender]);

  const onPressToggleOneToOne = useCallback(() => {
    if (!isOneToOne) return;
    if (!selectedProfileId || !otherProfileId) return;

    // rule: you can only switch if the other side is owned or public
    const allowed = new Set(
      [...(candidates.owned ?? []), ...(candidates.public ?? [])]
        .map((p) => String((p as any).id ?? ""))
        .filter(Boolean)
    );
    if (!allowed.has(String(otherProfileId))) return;

    const me = String(selectedProfileId);
    const other = String(otherProfileId);
    const current = String(sendAsId ?? me);
    setSendAsId(current === me ? other : me);
  }, [isOneToOne, selectedProfileId, otherProfileId, sendAsId, candidates]);

  const openPicker = useCallback(() => {
    if (isOneToOne) return; // 1:1 uses toggle
    // Defaults each time the modal opens.
    setOwnedOpen(true);
    setPublicOpen(false);
    setPickerOpen(true);
  }, [isOneToOne]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const onPressNewMessages = useCallback(() => {
    scrollToBottom(true);
    setShowNewMessages(false);
    setNewMsgCount(0);
  }, [scrollToBottom]);

  const sendAsProfile: Profile | null = useMemo(() => {
    if (!sendAsId) return null;
    return getProfileById?.(String(sendAsId)) ?? null;
  }, [sendAsId, getProfileById]);

  const receiverProfile: Profile | null = useMemo(() => {
    if (!selectedProfileId) return null;
    return getProfileById?.(String(selectedProfileId)) ?? null;
  }, [selectedProfileId, getProfileById]);

  const onPickSendAs = useCallback(
    (pid: string) => {
      setSendAsId(String(pid));
      closePicker();
    },
    [closePicker]
  );

  const stageSendAndClear = useCallback(() => {
    if (!sid || !cid) return;
    if (!sendAsId) return;
    if (!sendAsAllowedIds.has(String(sendAsId))) return;

    const body = String(text ?? "").trim();
    const imgs = Array.isArray(imageUris) ? imageUris.map(String).filter(Boolean) : [];
    if (!body && imgs.length === 0) return;

    pendingSendRef.current = {
      scenarioId: sid,
      conversationId: cid,
      senderProfileId: String(sendAsId),
      text: body,
      imageUris: imgs,
    };

    bumpSendBtn();
    // Clear composer as soon as the user presses the button.
    setText("");
    setImageUris([]);
    try {
      scrollToBottom(true);
    } catch {}
    draftPausedRef.current = false;
  }, [sid, cid, sendAsId, sendAsAllowedIds, text, imageUris, bumpSendBtn, scrollToBottom]);

  const flushPendingSend = useCallback(() => {
    if (didLongPressSendRef.current) {
      didLongPressSendRef.current = false;
      return;
    }

    const payload = pendingSendRef.current;
    pendingSendRef.current = null;
    if (!payload) return;

    const p = Promise.resolve(
      sendMessage?.({
        scenarioId: payload.scenarioId,
        conversationId: payload.conversationId,
        senderProfileId: payload.senderProfileId,
        text: payload.text,
        imageUris: payload.imageUris,
      })
    );

    void p
      .then(async (res: any) => {
        // accept several success shapes: { ok: true }, { messageId }, { message }
        const isSuccess = !!(res && (res.ok === true || (res as any).messageId || (res as any).message));

        if (isSuccess) {
          const toClear = [activeDraftKey, autosaveDraftKey].filter(Boolean) as string[];
          const unique = Array.from(new Set(toClear));
          await Promise.all(
            unique.map(async (k) => {
              try {
                await clearDraft(k);
              } catch {}
            })
          );
          try {
            const pid = String(sendAsId ?? selectedProfileId ?? "").trim();
            if (sid && cid && pid) {
              try { app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: false }); } catch {}

              // Mark only the message just sent as read via backend, but only if it was sent successfully and is not forbidden
              let sentMsgId = null;
              if (res?.messageId) sentMsgId = res.messageId;
              else if (res?.message?.id) sentMsgId = res.message.id;
              if (sentMsgId) {
                const sentMsg = app?.db?.messages?.[sentMsgId];
                if (sentMsg && !sentMsg.read && !res.error) {
                  try {
                    await app?.updateMessage?.({
                      scenarioId: sid,
                      messageId: String(sentMsgId),
                      text: sentMsg.text,
                      read: true,
                    });
                  } catch {}
                }
              }

              // Clear unread count for this conversation locally
              if (app?.db?.conversations?.[cid]) {
                try { app.db.conversations[cid].unreadCount = 0; } catch {}
              }
            }
          } catch {}

          return;
        }

        // If user accidentally picked/toggled to an invalid sender, snap back to the selected profile.
        if (selectedProfileId && String(sendAsId) !== String(selectedProfileId)) {
          setSendAsId(String(selectedProfileId));
        }
      })
      .catch(() => {
        // sendMessage marks the message failed; UI shows tap-to-retry.
      });
  }, [sendMessage, activeDraftKey, autosaveDraftKey, selectedProfileId, sendAsId]);

  const onPickImages = useCallback(async () => {
    const remaining = Math.max(0, 4 - (imageUris?.length ?? 0));
    if (remaining <= 0) return;
    const uris = await pickAndPersistManyImages({ remaining, persistAs: "img" });
    if (!uris || uris.length === 0) return;
    setImageUris((prev) => {
      const next = [...(prev ?? []), ...uris.map(String).filter(Boolean)];
      return next.slice(0, 4);
    });
  }, [imageUris]);

  const retryFailedMessage = useCallback(
    (m: Message) => {
      if (!sid || !cid) return;
      const mid = String((m as any)?.id ?? "").trim();
      if (!mid) return;

      const status = String((m as any)?.clientStatus ?? "").trim();
      if (status && status !== "failed") return;

      const senderProfileId = String((m as any)?.senderProfileId ?? "").trim();
      const body = String((m as any)?.text ?? "").trim();
      const imageUris = coerceStringArray((m as any)?.imageUrls ?? (m as any)?.image_urls);
      const kind = String((m as any)?.kind ?? "text").trim();

      // Reuse the same client message id so the UI doesn't duplicate bubbles.
      const p = Promise.resolve(
        sendMessage?.({
          scenarioId: sid,
          conversationId: cid,
          senderProfileId: senderProfileId || String(sendAsId ?? selectedProfileId ?? ""),
          text: body,
          imageUris,
          kind,
          clientMessageId: mid,
        } as any)
      );

      void p.catch(() => {
        // sendMessage already marks the message failed + returns an error; screen can stay quiet.
      });
    },
    [sid, cid, sendMessage, sendAsId, selectedProfileId]
  );

  const lastMineMessageId = useMemo(() => {
    const mineId = String(selectedProfileId ?? "").trim();
    if (!mineId) return "";
    const list = reorderMode ? reorderDraft ?? messages : visibleMessages;
    for (let i = (list?.length ?? 0) - 1; i >= 0; i--) {
      const m = list[i] as any;
      const kind = String(m?.kind ?? "text").trim();
      if (kind === "separator") continue;
      const senderId = String(m?.senderProfileId ?? "").trim();
      if (senderId !== mineId) continue;
      const id = String(m?.id ?? "").trim();
      if (id) return id;
    }
    return "";
  }, [selectedProfileId, reorderMode, reorderDraft, messages, visibleMessages]);

  const renderBubbleRow = useCallback(
    (
      item: Message,
      opts?: {
        onLongPress?: () => void;
        active?: boolean;
        drag?: () => void;
        prev?: Message | null;
        next?: Message | null;
      }
    ) => {
    const senderId = String((item as any).senderProfileId ?? "");
    const isRight = senderId === String(selectedProfileId ?? "");
    const sender: Profile | null = senderId ? (getProfileById?.(senderId) ?? null) : null;
    const imageUrls = coerceStringArray((item as any).imageUrls ?? (item as any).image_urls);
    const kind = String((item as any).kind ?? "text").trim();
    const hasText = Boolean(String((item as any).text ?? "").trim());
    const hasImages = imageUrls.length > 0;
    const forceColumnWidth = hasImages; // when images exist, keep a stable column width so images don't shrink to short text

    const clientStatus = String((item as any).clientStatus ?? "").trim();
    const canRetry = clientStatus === "failed";
    const showSending = clientStatus === "sending";
    const showFailed = clientStatus === "failed";
    const isLastMine = isRight && String((item as any).id ?? "") === lastMineMessageId;
    const hasClientMessageId = Boolean(
      String((item as any).clientMessageId ?? (item as any).client_message_id ?? "").trim()
    );
    const showDelivered =
      isLastMine &&
      hasClientMessageId &&
      !showSending &&
      !showFailed &&
      !String((item as any).id ?? "").startsWith("client_");

    const showDayHeader = (() => {
      if (reorderMode) return false;
      if (kind === "separator") return false;
      const myKey = getLocalDayKey((item as any)?.createdAt);
      if (!myKey) return false;
      const prevKey = opts?.prev ? getLocalDayKey((opts.prev as any)?.createdAt) : "";
      if (!prevKey) return true;
      return prevKey !== myKey;
    })();
    const dayHeaderText = showDayHeader ? formatChatDayHeader((item as any)?.createdAt) : "";

    const canSwipeEdit = !reorderMode && editAllowedIds.has(senderId);

    if (kind === "separator") {
      const sepRow = (
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
            {String((item as any).text ?? "")}
          </ThemedText>
        </View>
      );

      return (
        <SwipeableRow
          enabled={canSwipeEdit}
          colors={{ tint: colors.tint, pressed: colors.pressed }}
          rightThreshold={40}
          onEdit={() => openEdit(item)}
          onDelete={async () => {
            if (!sid) return;
            const mid = String((item as any).id ?? "");
            if (!mid) return;
            Alert.alert("Delete message?", "This will remove the message.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await runDeleteMessage(mid);
                },
              },
            ]);
          }}
        >
          {sepRow}
        </SwipeableRow>
      );
    }

    const prevSenderId = String((opts?.prev as any)?.senderProfileId ?? "");
    const prevKind = String((opts?.prev as any)?.kind ?? "text").trim();
    const prevIsGroupBreak = !opts?.prev || prevKind === "separator";
    const isSameSenderAsPrev = !prevIsGroupBreak && prevSenderId && prevSenderId === senderId;

    const nextSenderId = String((opts?.next as any)?.senderProfileId ?? "");
    const nextKind = String((opts?.next as any)?.kind ?? "text").trim();
    const nextIsGroupBreak = !opts?.next || nextKind === "separator";
    const isSameSenderAsNext = !nextIsGroupBreak && nextSenderId && nextSenderId === senderId;

    const isGroupChat = !isOneToOne;
    const isLeft = !isRight;
    const groupStart = isGroupChat && isLeft && !isSameSenderAsPrev;
    const groupEnd = isGroupChat && isLeft && !isSameSenderAsNext;

    // grouping:
    // - name above first message of a run
    // - avatar next to last message of a run
    // - reserve avatar gutter for all left messages so bubbles align
    const showSenderNameAbove = groupStart;
    const showLeftAvatar = groupEnd;

    const onPressSenderAvatar = () => {
      if (!sid) return;
      if (!senderId) return;
      router.push({
        pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
        params: { scenarioId: sid, profileId: senderId },
      } as any);
    };

    const row = (
      <Pressable
        onPress={() => {
          if (!canRetry) return;
          retryFailedMessage(item);
        }}
        onLongPress={() => {
          // Only begin dragging when already in reorder mode; don't enter reorder
          // mode by long-pressing an individual message.
          if (reorderMode) {
            opts?.drag?.();
            return;
          }

          const mid = String((item as any)?.id ?? "").trim();
          if (!mid) return;

          Alert.alert("Message actions", undefined, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Report message",
              style: "destructive",
              onPress: () => {
                DialogAlert.prompt(
                  "Report message",
                  "Tell us what’s wrong (optional). This sends a snapshot to support@feedverse.app.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Send report",
                      style: "destructive",
                      onPress: (value?: string) => {
                        void reportMessageById(mid, value);
                      },
                    },
                  ],
                  "plain-text",
                  "",
                );
              },
            },
          ]);
        }}
        delayLongPress={180}
        style={({ pressed }) => [
          pressed && { opacity: 0.92 },
          opts?.active ? { opacity: 0.85 } : null,
        ]}
      >
        <View style={[styles.bubbleRow, { justifyContent: isRight ? "flex-end" : "flex-start" }]}>
          {isLeft && isGroupChat ? (
            <View style={{ width: 26, alignItems: "center", justifyContent: "flex-end" }}>
              {showLeftAvatar ? (
                <Pressable
                  onPress={onPressSenderAvatar}
                  hitSlop={10}
                  style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  <Avatar uri={sender?.avatarUrl ?? null} size={26} fallbackColor={colors.border} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[{ maxWidth: "78%" }, forceColumnWidth ? { width: "78%" } : null]}>
            {showSenderNameAbove ? (
              <ThemedText style={[styles.senderNameAbove, { color: colors.textSecondary }]} numberOfLines={1}>
                {sender?.displayName ? String(sender.displayName) : "unknown"}
              </ThemedText>
            ) : null}

            {hasText ? (
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: isRight ? colors.tint : colors.message,
                    borderWidth: 0,
                    alignSelf: isRight ? "flex-end" : "flex-start", // keep text bubble hugging its content even when column is fixed width
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.bubbleText,
                    { color: isRight ? (scheme === "dark" ? colors.text : colors.background) : colors.text },
                  ]}
                >
                  {String((item as any).text ?? "")}
                </ThemedText>
              </View>
            ) : null}

            {hasImages ? (
              <View style={{ marginTop: 6 }}>
                <MediaGrid
                  urls={imageUrls}
                  variant={"reply"}
                  backgroundColor={colors.border}
                  onOpen={(index) => {
                    setLightboxUrls(imageUrls);
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                />
              </View>
            ) : null}

            {showSending && isRight ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  alignSelf: isRight ? "flex-end" : "flex-start",
                }}
              >
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>Sending…</ThemedText>
              </View>
            ) : null}

            {showFailed ? (
              <ThemedText
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: scheme === "dark" ? "#FF7B7B" : "#D73A49",
                  alignSelf: isRight ? "flex-end" : "flex-start",
                }}
              >
                Failed to send • tap to retry
              </ThemedText>
            ) : null}

            {showDelivered ? (
              <ThemedText
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: colors.textSecondary,
                  alignSelf: isRight ? "flex-end" : "flex-start",
                }}
              >
                Delivered
              </ThemedText>
            ) : null}
          </View>
        </View>
      </Pressable>
    );

    const dayHeader = showDayHeader && dayHeaderText ? (
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        <ThemedText style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{dayHeaderText}</ThemedText>
      </View>
    ) : null;

    return (
      <SwipeableRow
        enabled={canSwipeEdit}
        colors={{ tint: colors.tint, pressed: colors.pressed }}
        rightThreshold={40}
        onEdit={() => openEdit(item)}
        onDelete={async () => {
          if (!sid) return;
          const mid = String((item as any).id ?? "");
          if (!mid) return;
          Alert.alert("Delete message?", "This will remove the message.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                await runDeleteMessage(mid);
              },
            },
          ]);
        }}
      >
        <View>
          {dayHeader}
          {row}
        </View>
      </SwipeableRow>
    );
    },
    [
      colors,
      editAllowedIds,
      getProfileById,
      isOneToOne,
      lastMineMessageId,
      openEdit,
      reorderMode,
      router,
      runDeleteMessage,
      selectedProfileId,
      sid,
      setLightboxIndex,
      setLightboxOpen,
      setLightboxUrls,
    ],
  );

  const composerAttachments =
    imageUris.length > 0 ? (
      <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
        <MediaGrid
          urls={imageUris}
          variant={"reply"}
          backgroundColor={colors.border}
          onOpen={(index) => {
            setLightboxUrls(imageUris);
            setLightboxIndex(index);
            setLightboxOpen(true);
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
          <Pressable
            onPress={() => setImageUris([])}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.75 }]}
          >
            <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>Clear images</ThemedText>
          </Pressable>
        </View>
      </View>
    ) : null;

  const dataForList = reorderMode ? reorderDraft ?? visibleMessagesForList : visibleMessagesForList;

  const renderListItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<Message>) => {
      const index = Number(getIndex?.() ?? 0);
      const bubble = renderBubbleRow(item, {
        drag: reorderMode ? drag : undefined,
        active: reorderMode ? isActive : false,
        // dataForList is newest-first; renderBubbleRow expects chronological adjacency.
        prev: index + 1 < dataForList.length ? dataForList[index + 1] : null,
        next: index > 0 ? dataForList[index - 1] : null,
      });

      // List is inverted, so flip each row back upright.
      return <View style={invertedRowStyle}>{bubble}</View>;
    },
    [dataForList, invertedRowStyle, reorderMode, renderBubbleRow],
  );

  const handleDragEnd = useCallback(
    ({ data: next }: { data: Message[] }) => {
      if (!reorderMode) return;
      setReorderDraft(next as Message[]);
    },
    [reorderMode],
  );

  if (!isReady || !receiverProfile || !conversation) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>loading…</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerSide}>
            <Pressable
              onPress={() => {
                if (reorderMode) {
                  exitReorderMode();
                  return;
                }
                router.back();
              }}
              hitSlop={12}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name={reorderMode ? "close" : "chevron-back"} size={22} color={colors.text} />
            </Pressable>
          </View>

          <Pressable
            onPress={onPressHeader}
            disabled={!canEditGroup}
            style={({ pressed }) => [
              styles.headerCenter,
              pressed && canEditGroup ? { opacity: 0.75 } : null,
            ]}
          >
            <View style={styles.headerCenterInner}>
              <Pressable
                onPress={() => {
                  // 1:1: avatar should open the other participant's profile
                  if (isOneToOne) {
                    if (!sid || !otherProfileId) return;
                    router.push({
                      pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
                      params: { scenarioId: sid, profileId: String(otherProfileId) },
                    } as any);
                    return;
                  }

                  // Group chat: keep existing behavior (open editor)
                  if (!canEditGroup) return;
                  onPressHeader();
                }}
                onLongPress={() => {
                  // Enter reorder mode when the avatar is long-pressed (GC or DM)
                  enterReorderMode();
                }}
                disabled={false}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={isOneToOne ? "Open profile" : "Reorder messages"}
              >
                <Avatar uri={headerAvatarUrl} size={38} fallbackColor={colors.border} />
              </Pressable>
              <ThemedText style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {title}
              </ThemedText>
            </View>
          </Pressable>

          <View style={styles.headerSide}>
            {reorderMode ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={onSaveReorder}
                  hitSlop={12}
                  style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  disabled={reorderSaving}
                >
                  <Ionicons name="checkmark" size={20} color={colors.tint} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {!reorderMode && showNewMessages && newMsgCount > 0 ? (
          <View pointerEvents="box-none" style={styles.floaterWrap}>
            <Pressable
              onPress={onPressNewMessages}
              style={({ pressed }) => [
                styles.floaterBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="arrow-down" size={16} color={colors.tint} />
              <ThemedText style={{ color: colors.text, fontWeight: "900" }}>
                New messages{newMsgCount > 1 ? ` (${newMsgCount})` : ""}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        <DraggableFlatList
          ref={(r) => {
            // Keep a single list instance mounted so we don't reset scroll position
            // when toggling reorder mode.
            dragListRef.current = r;
            listRef.current = r as any;
          }}
          // IMPORTANT: DraggableFlatList wraps the underlying FlatList in an outer container.
          // `style` affects the inner list; `containerStyle` must be flexed so the list
          // actually takes up height and the composer stays pinned to the bottom.
          containerStyle={listContainerStyle}
          style={listStyle}
          data={dataForList}
          {...({ invertDragDirection: reorderMode } as any)}
          keyExtractor={keyExtractor}
          // With `inverted`, anchor content to the visual bottom (start).
          // `flexGrow: 1` also ensures short threads don't collapse upward.
          contentContainerStyle={listContentContainerStyle}
          // Keep the list inverted in all modes (chat opens at bottom instantly).
          inverted
          // In an inverted list, the header renders at the visual bottom.
          ListHeaderComponent={reorderMode ? null : typingFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.25}
          activationDistance={12}
          dragItemOverflow={reorderMode}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onScrollToIndexFailed={onScrollToIndexFailed}
          renderItem={renderListItem}
          onDragEnd={handleDragEnd as any}
        />

        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
          {composerAttachments}
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            {isOneToOne ? (
              <Pressable
                onPress={onPressToggleOneToOne}
                hitSlop={10}
                disabled={!canSwitchOneToOneSender}
                style={({ pressed }) => [
                  styles.senderToggle,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  (!canSwitchOneToOneSender || pressed) && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Switch sender"
              >
                <Animated.View
                  style={[
                    styles.senderToggleThumb,
                    {
                      backgroundColor: colors.tint,
                      transform: [
                        {
                          translateX: senderSlider.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 18],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </Pressable>
            ) : (
              <View style={{ alignItems: "center" }}>
                <AuthorAvatarPicker colors={colors} avatarUrl={sendAsProfile?.avatarUrl ?? null} onPress={openPicker} />
              </View>
            )}

            <TextInput
              value={text}
              onChangeText={handleChangeText}
              onBlur={handleInputBlur}
              placeholder="message…"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, backgroundColor: colors.card }]}
              multiline
              editable={sendAsAllowedIds.has(String(sendAsId))}
            />

            <Pressable
              onPress={onPickImages}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add images"
              disabled={!sendAsAllowedIds.has(String(sendAsId))}
            >
              <Ionicons name="image-outline" size={18} color={colors.text} />
            </Pressable>

            <Animated.View style={{ transform: [{ scale: sendBtnScale }] }}>
              <Pressable
                onPressIn={stageSendAndClear}
                onPress={flushPendingSend}
                disabled={
                  !sendAsId ||
                  (!String(text ?? "").trim() && (imageUris?.length ?? 0) === 0) ||
                  !sendAsAllowedIds.has(String(sendAsId))
                }
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity:
                      !sendAsId ||
                      (!String(text ?? "").trim() && (imageUris?.length ?? 0) === 0) ||
                      !sendAsAllowedIds.has(String(sendAsId))
                        ? 0.4
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
                onLongPress={async () => {
                // long-press send: if there is text, send as a centered small 'separator' message
                didLongPressSendRef.current = true;
                const staged = pendingSendRef.current;
                pendingSendRef.current = null;

                const body = String(staged?.text ?? text ?? "").trim();
                if (!sendAsId || !sendAsAllowedIds.has(String(sendAsId))) return;
                if (!body) {
                  Alert.alert("Separator text required", "Type separator text then long-press send to create it.");
                  return;
                }

                bumpSendBtn();
                // Already cleared onPressIn; keep attachments cleared too.
                setText("");
                setImageUris([]);
                try { scrollToBottom(true); } catch {}

                let res: any;
                try {
                  res = await sendMessage?.({
                    scenarioId: sid,
                    conversationId: cid,
                    senderProfileId: String(sendAsId),
                    text: body,
                    kind: "separator",
                    imageUris: [],
                  });
                } catch (e) {
                  Alert.alert("Could not send", formatErrorMessage(e, "Send failed"));
                  return;
                }

                const isSuccess = !!(res && (res.ok === true || (res as any).messageId || (res as any).message));
                if (!isSuccess) {
                  Alert.alert("Could not send", String((res as any)?.error ?? "Send failed"));
                  return;
                }

              }}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Ionicons name="arrow-up" size={18} color={colors.background} />
              </Pressable>
            </Animated.View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <Lightbox
        urls={lightboxUrls}
        initialIndex={lightboxIndex}
        visible={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Loading overlay removed as requested */}

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={closePicker}>
        <Pressable style={[styles.pickerBackdrop, { backgroundColor: colors.modalBackdrop }]} onPress={closePicker}>
          <Pressable
            style={[styles.pickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={styles.pickerHeader}>
              <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>send as</ThemedText>
              <Pressable onPress={closePicker} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.pickerBody}
              contentContainerStyle={styles.pickerBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                onPress={() => setOwnedOpen((v) => !v)}
                hitSlop={10}
                style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.8 }]}
              >
                <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>your profiles</ThemedText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "900", fontSize: 12 }}>
                    {candidates.owned.length}
                  </ThemedText>
                  <Ionicons name={ownedOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
                </View>
              </Pressable>

              {ownedOpen
                ? candidates.owned.map((p) => {
                    const active = String((p as any).id) === String(sendAsId ?? "");
                    return (
                      <Pressable
                        key={String((p as any).id)}
                        onPress={() => onPickSendAs(String((p as any).id))}
                        style={({ pressed }) => [
                          styles.pickRow,
                          { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                        ]}
                      >
                        <Avatar
                          uri={String((p as any).avatarUrl ?? "") || null}
                          size={30}
                          fallbackColor={colors.border}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                            {String((p as any).displayName ?? "")}
                          </ThemedText>
                          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                            @{String((p as any).handle ?? "")}
                          </ThemedText>
                        </View>
                        {active ? <Ionicons name="checkmark" size={18} color={colors.tint} /> : null}
                      </Pressable>
                    );
                  })
                : null}

              <Pressable
                onPress={() => setPublicOpen((v) => !v)}
                hitSlop={10}
                style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.8 }]}
              >
                <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>
                  shared profiles
                </ThemedText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "900", fontSize: 12 }}>
                    {candidates.public.length}
                  </ThemedText>
                  <Ionicons name={publicOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
                </View>
              </Pressable>

              {publicOpen
                ? candidates.public.map((p) => {
                    const active = String((p as any).id) === String(sendAsId ?? "");
                    return (
                      <Pressable
                        key={String((p as any).id)}
                        onPress={() => onPickSendAs(String((p as any).id))}
                        style={({ pressed }) => [
                          styles.pickRow,
                          { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                        ]}
                      >
                        <Avatar
                          uri={String((p as any).avatarUrl ?? "") || null}
                          size={30}
                          fallbackColor={colors.border}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                            {String((p as any).displayName ?? "")}
                          </ThemedText>
                          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                            @{String((p as any).handle ?? "")}
                          </ThemedText>
                        </View>
                        {active ? <Ionicons name="checkmark" size={18} color={colors.tint} /> : null}
                      </Pressable>
                    );
                  })
                : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={[styles.pickerBackdrop, { backgroundColor: colors.modalBackdrop }]} onPress={closeEdit}>
          <Pressable
            style={[styles.editCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={styles.pickerHeader}>
              <Pressable onPress={closeEdit} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>cancel</ThemedText>
              </Pressable>

              <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>edit</ThemedText>

              <Pressable onPress={onSaveEdit} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>done</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 10 }]}>text</ThemedText>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              placeholder="message…"
              placeholderTextColor={colors.textSecondary}
              style={[styles.editInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
              multiline
              autoFocus
            />

            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>sent by</ThemedText>
            {eligibleEditSenders.length === 0 ? (
              <ThemedText style={{ color: colors.textSecondary, marginTop: 10 }}>no editable senders</ThemedText>
            ) : (
              <>
                {eligibleEditSendersOwned.map((p) => {
                  const pid = String((p as any).id ?? "");
                  const active = pid && pid === String(editSenderId ?? "");
                  return (
                    <Pressable
                      key={pid}
                      onPress={() => setEditSenderId(pid)}
                      style={({ pressed }) => [
                        styles.pickRow,
                        { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                      ]}
                    >
                      <Avatar uri={String((p as any).avatarUrl ?? "") || null} size={30} fallbackColor={colors.border} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                          {String((p as any).displayName ?? "")}
                        </ThemedText>
                        <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                          @{String((p as any).handle ?? "")}
                        </ThemedText>
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={colors.tint} /> : null}
                    </Pressable>
                  );
                })}

                {eligibleEditSendersPublic.length > 0 ? (
                  <Pressable
                    onPress={() => setEditPublicOpen((v) => !v)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.8 }]}
                  >
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>
                      public profiles
                    </ThemedText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <ThemedText style={{ color: colors.textSecondary, fontWeight: "900", fontSize: 12 }}>
                        {eligibleEditSendersPublic.length}
                      </ThemedText>
                      <Ionicons
                        name={editPublicOpen ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textSecondary}
                      />
                    </View>
                  </Pressable>
                ) : null}

                {editPublicOpen
                  ? eligibleEditSendersPublic.map((p) => {
                      const pid = String((p as any).id ?? "");
                      const active = pid && pid === String(editSenderId ?? "");
                      return (
                        <Pressable
                          key={pid}
                          onPress={() => setEditSenderId(pid)}
                          style={({ pressed }) => [
                            styles.pickRow,
                            { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                          ]}
                        >
                          <Avatar uri={String((p as any).avatarUrl ?? "") || null} size={30} fallbackColor={colors.border} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                              {String((p as any).displayName ?? "")}
                            </ThemedText>
                            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                              @{String((p as any).handle ?? "")}
                            </ThemedText>
                          </View>
                          {active ? <Ionicons name="checkmark" size={18} color={colors.tint} /> : null}
                        </Pressable>
                      );
                    })
                  : null}
              </>
            )}

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
              <Pressable
                onPress={onDeleteEdit}
                hitSlop={10}
                style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.border }, pressed && { opacity: 0.75 }]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>delete</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSide: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenterInner: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    maxWidth: "100%",
  },
  headerTitle: {
    fontWeight: "900",
    fontSize: 16,
    flexShrink: 1,
    textAlign: "center",
  },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 6 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  senderNameAbove: { fontSize: 11, fontWeight: "800", marginBottom: 3, paddingLeft: 8 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  senderToggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    justifyContent: "center",
  },
  senderToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  pickerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  pickerCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: "hidden",
  },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerBody: { marginTop: 8 },
  pickerBodyContent: { paddingBottom: 6 },
  sectionTitle: { marginTop: 12, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  pickRow: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  editCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  editInput: {
    marginTop: 10,
    minHeight: 80,
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  floaterWrap: {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 78, // sits above composer
  alignItems: "center",
  zIndex: 50,
},
floaterBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 999,
  borderWidth: StyleSheet.hairlineWidth,
},
  typingRowWrap: {
    paddingTop: 2,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  typingRowAvatar: {
    paddingBottom: 2,
  },
});