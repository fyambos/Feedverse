// mobile/app/(scenario)/[scenarioId]/(tabs)/messages/[conversationId].tsx

import { setActiveConversation, subscribeToMessageEvents, subscribeToTypingEvents } from "@/context/appData";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  ActivityIndicator,
  FlatList,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useFocusEffect } from "@react-navigation/native";

import { ThemedText } from "@/components/themed-text";
import { presentNotification } from "@/context/appData";
import TypingIndicator from "@/components/ui/TypingIndicator";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import type { Conversation, Message, Profile } from "@/data/db/schema";
import { AuthorAvatarPicker } from "@/components/postComposer/AuthorAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { apiFetch } from "@/lib/apiClient";
import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Lightbox } from "@/components/media/LightBox";
import { formatErrorMessage } from "@/lib/format";

function parsePgTextArrayLiteral(input: string): string[] {
  const s = String(input ?? "").trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return [];
  const body = s.slice(1, -1);
  if (!body) return [];

  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let escape = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      const v = cur.trim();
      if (v && v.toUpperCase() !== "NULL") out.push(v);
      cur = "";
      continue;
    }
    cur += ch;
  }

  const last = cur.trim();
  if (last && last.toUpperCase() !== "NULL") out.push(last);
  return out.map((x) => String(x)).filter(Boolean);
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();

    // JSON array?
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        // ignore
      }
    }

    // Postgres array literal?
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return parsePgTextArrayLiteral(trimmed);
    }
  }
  return [];
}



export default function ConversationThreadScreen() {


  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { scenarioId, conversationId } = useLocalSearchParams<{ scenarioId: string; conversationId: string }>();

  const sid = String(scenarioId ?? "");
  const cid = String(conversationId ?? "");

  const app = useAppData() as any;
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

  // Track which conversation is currently active (non-reactive; avoids update loops)
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(sid, cid);
      return () => setActiveConversation(sid, null);
    }, [sid, cid])
  );

  // Live message subscription: append new messages for this conversation
  useEffect(() => {
    if (!sid || !cid) return;
    // Handler for new messages
    const handler = (msg: any) => {
      if (String(msg.scenarioId) === sid && String(msg.conversationId) === cid) {
        // Force a state update by syncing messages for this conversation
        app?.syncMessagesForConversation?.({ scenarioId: sid, conversationId: cid, limit: 200 });
      }
    };
    const unsubscribe = subscribeToMessageEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [sid, cid, app]);

  const selectedProfileId: string | null = useMemo(
    () => (sid ? (getSelectedProfileId?.(sid) ?? null) : null),
    [sid, getSelectedProfileId]
  );

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
  const [publicOpen, setPublicOpen] = useState(false);

  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  const deleteMessageRef = useRef(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<Message[] | null>(null);

  // Show a full-white loading screen briefly when opening a conversation
  const [openLoading, setOpenLoading] = useState<boolean>(true);

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

      let cancelled = false;

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

      return () => {
        cancelled = true;
      };
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

  const messagesMap: Record<string, Message> = useMemo(() => ((db as any)?.messages ?? {}) as any, [db]);
  const messages: Message[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid || !cid) return [];

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
  }, [isReady, sid, cid, messagesMap]);

  // Messages currently visible in UI (last `visibleCount` messages)
  const visibleMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [] as Message[];
    const start = Math.max(0, messages.length - visibleCount);
    return messages.slice(start);
  }, [messages, visibleCount]);

  const listRef = useRef<FlatList<Message> | null>(null);
  const dragListRef = useRef<any>(null);

  // --- scrolling helpers (non-inverted list) ---
  const didInitialScrollRef = useRef(false);
  const didListLayoutRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);

  // Small debounced scroll-to-end to avoid landing in the middle while items/images finish layout.
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((animated: boolean) => {
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);

    // Wait for layout + interactions, then scroll.
    // Use a slightly longer debounce for animated scrolls and schedule a follow-up
    // fallback scroll to make sure very long lists actually reach the end.
    const delay = animated ? 120 : 20;
    scrollDebounceRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        InteractionManager.runAfterInteractions(() => {
          try {
            listRef.current?.scrollToEnd({ animated });
          } catch {}
          // Follow-up: sometimes the first scroll lands short due to late layout/images.
          // Schedule one more non-animated jump shortly after to ensure exact bottom.
          setTimeout(() => {
            try {
              listRef.current?.scrollToEnd({ animated: false });
            } catch {}
          }, 160);
        });
      });
    }, delay);
  }, []);

  const handleListLayout = useCallback(() => {
    didListLayoutRef.current = true;

    // When we first get a real layout, ensure we are at the bottom.
    if (!reorderMode && !didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      scrollToBottom(false);
    }
  }, [reorderMode, messages.length, scrollToBottom]);

  const handleContentSizeChange = useCallback(() => {
    if (reorderMode) return;

    // If we don't have the list layout yet, don't try to scroll; we'll do it in onLayout.
    if (!didListLayoutRef.current) return;

    // First time we have content: jump to bottom without animation.
    if (!didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      scrollToBottom(false);
      return;
    }

    // Keep pinned only if user is already near bottom.
    if (isNearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [reorderMode, messages.length, scrollToBottom]);

  // Load older messages (increase visibleCount) and preserve scroll position
  const loadOlderMessages = useCallback(() => {
    if (loadingOlderRef.current) return;
    if (visibleMessages.length >= messages.length) return;
    loadingOlderRef.current = true;

    const firstVisibleId = visibleMessages[0]?.id;

    setVisibleCount((v) => Math.min(messages.length, v + PAGE_SIZE));

    // after DOM updates, scroll to keep the previous first visible item at top
    setTimeout(() => {
      try {
        if (!firstVisibleId) return;
        const all = messages;
        const newStart = Math.max(0, all.length - (Math.min(messages.length, visibleCount + PAGE_SIZE)));
        const idx = all.findIndex((m) => String(m.id) === String(firstVisibleId));
        const newIndex = idx - newStart;
        if (newIndex >= 0) {
          listRef.current?.scrollToIndex({ index: newIndex, animated: false });
        }
      } catch {}
      loadingOlderRef.current = false;
    }, 80);
  }, [messages, visibleMessages, visibleCount]);

  const onScrollToIndexFailed = useCallback((_info: any) => {
    // If items aren't measured yet, wait a tick then jump to end.
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 50);
  }, []);

  const handleScroll = useCallback((e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const paddingToBottom = 220;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    const nearBottom = distanceFromBottom <= paddingToBottom;

    isNearBottomRef.current = nearBottom;

    // if user comes back to bottom, clear floater
    if (nearBottom) {
      setShowNewMessages(false);
      setNewMsgCount(0);
    }
    // autoload older messages when scrolling to the top
    try {
      const nearTopThreshold = 80;
      const nearTop = contentOffset.y <= nearTopThreshold;
      if (nearTop && !reorderMode && !loadingOlderRef.current && visibleMessages.length < messages.length) {
        loadOlderMessages();
      }
    } catch {}
  }, [reorderMode, visibleMessages.length, messages.length, loadOlderMessages]);

  const syncOnceRef = useRef<string | null>(null);

  useEffect(() => {
    didInitialScrollRef.current = false;
    didListLayoutRef.current = false;
    prevMsgCountRef.current = 0;
    isNearBottomRef.current = true;
    // reset open-loading when conversation changes
    setOpenLoading(true);
    // Scroll to bottom immediately (before layout or sync)
    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: false });
      } catch {}
    }, 0);
    const t = setTimeout(() => setOpenLoading(false), 100);
    return () => clearTimeout(t);
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
      try {
        const pid = String(sendAsId ?? selectedProfileId ?? "").trim();
        if (!sid || !cid || !pid) return;
        if (!typingIsActiveRef.current) {
          typingIsActiveRef.current = true;
          try { app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: true }); } catch {}
        }
        if (typingSendTimeoutRef.current) clearTimeout(typingSendTimeoutRef.current as any);
        typingSendTimeoutRef.current = setTimeout(() => {
          typingIsActiveRef.current = false;
          try { app?.sendTyping?.({ scenarioId: sid, conversationId: cid, profileId: pid, typing: false }); } catch {}
          typingSendTimeoutRef.current = null;
        }, 1500);
      } catch {
        // ignore
      }
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

  useEffect(() => {
    if (!reorderMode) {
      setReorderDraft(null);
      return;
    }
    setReorderDraft(messages);
  }, [reorderMode, messages]);

  // When entering reorder mode, ensure the draggable list scrolls to bottom.
  useEffect(() => {
    if (!reorderMode) return;

    let cancelled = false;

    const tryScrollToBottom = async () => {
        // wait for a frame and any pending interactions/layout
        await new Promise((res) => requestAnimationFrame(() => res(undefined)));
        await new Promise((res) => InteractionManager.runAfterInteractions(() => res(undefined)));

      const maxTries = 4;
      for (let i = 0; i < maxTries; i++) {
        if (cancelled) return;

        try {
          if (dragListRef.current?.scrollToEnd) {
            try { dragListRef.current.scrollToEnd({ animated: false }); } catch {}
          }

          if (dragListRef.current?.scrollToIndex) {
            try {
              const len = (dragListRef.current?.props?.data?.length ?? messages.length) - 1;
              if (len >= 0) dragListRef.current.scrollToIndex({ index: len, animated: false });
            } catch {}
          }

          if (dragListRef.current?.scrollToOffset) {
            try { dragListRef.current.scrollToOffset({ offset: 9999999, animated: false }); } catch {}
          }
        } catch {}

        // short pause for layout to settle before retrying
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, 80));
      }
    };

    void tryScrollToBottom();

    return () => {
      cancelled = true;
    };
  }, [reorderMode, messages.length]);

  const oneToOneSide: "left" | "right" = useMemo(() => {
    // right = selected profile ("you"), left = other participant
    if (!isOneToOne) return "right";
    const me = String(selectedProfileId ?? "");
    const current = String(sendAsId ?? me);
    return current === me ? "right" : "left";
  }, [isOneToOne, selectedProfileId, sendAsId]);

  const senderSlider = useRef(new Animated.Value(oneToOneSide === "right" ? 1 : 0)).current;

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

  const onSend = useCallback(async () => {
    if (!sid || !cid) return;
    if (!sendAsId) return;

    const body = String(text ?? "").trim();
    const imgs = Array.isArray(imageUris) ? imageUris.map(String).filter(Boolean) : [];
    if (!body && imgs.length === 0) return;

    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    let res: any;
    try {
      res = await sendMessage?.({
        scenarioId: sid,
        conversationId: cid,
        senderProfileId: String(sendAsId),
        text: body,
        imageUris: imgs,
      });
    } catch (e) {
      Alert.alert("Could not send", formatErrorMessage(e, "Send failed"));
      return;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }

    // accept several success shapes: { ok: true }, { messageId }, { message }
    const isSuccess = !!(res && (res.ok === true || (res as any).messageId || (res as any).message));

    if (isSuccess) {
      setText("");
      setImageUris([]);
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
      // scroll to bottom when the local user sends a message
      try { scrollToBottom(true); } catch {}
      return;
    }

    const msg = String((res as any)?.error ?? "Send failed");
    Alert.alert("Could not send", msg);

    // If user accidentally picked/toggled to an invalid sender, snap back to the selected profile.
    if (selectedProfileId && String(sendAsId) !== String(selectedProfileId)) {
      setSendAsId(String(selectedProfileId));
    }
  }, [sid, cid, sendAsId, text, imageUris, sendMessage, selectedProfileId, scrollToBottom]);

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

  const renderBubbleRow = (
    item: Message,
    opts?: {
      onLongPress?: () => void;
      active?: boolean;
      drag?: () => void;
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

    const showLeftAvatar = !isRight && !isOneToOne;
    const showSenderNameAbove = !isRight && !isOneToOne;

    const row = (
      <Pressable
        onLongPress={() => {
          // Only begin dragging when already in reorder mode; don't enter reorder
          // mode by long-pressing an individual message.
          if (reorderMode) {
            opts?.drag?.();
          }
        }}
        delayLongPress={180}
        style={({ pressed }) => [
          pressed && { opacity: 0.92 },
          opts?.active ? { opacity: 0.85 } : null,
        ]}
      >
        <View style={[styles.bubbleRow, { justifyContent: isRight ? "flex-end" : "flex-start" }]}>
          {showLeftAvatar ? <Avatar uri={sender?.avatarUrl ?? null} size={26} fallbackColor={colors.border} /> : null}

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
          </View>
        </View>
      </Pressable>
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
        {row}
      </SwipeableRow>
    );
  };

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

  const renderBubble = ({ item }: { item: Message }) => renderBubbleRow(item);

  const dataForList = reorderMode ? reorderDraft ?? messages : visibleMessages;

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
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
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
                  if (!canEditGroup) return;
                  onPressHeader();
                }}
                onLongPress={() => {
                  // Enter reorder mode when the avatar is long-pressed (GC or DM)
                  setReorderMode(true);
                }}
                disabled={!canEditGroup}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Reorder messages"
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
              <Pressable
                onPress={() => setReorderMode(false)}
                hitSlop={12}
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Ionicons name="checkmark" size={20} color={colors.tint} />
              </Pressable>
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
        {reorderMode ? (
          <DraggableFlatList
            ref={(r) => {
              dragListRef.current = r;
            }}
            data={dataForList}
            keyExtractor={(m) => String((m as any).id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 10 }}
            activationDistance={12}
            dragItemOverflow
            renderItem={({ item, drag, isActive }: RenderItemParams<Message>) =>
              renderBubbleRow(item, { drag, active: isActive })
            }
            onDragEnd={({ data: next }) => {
              setReorderDraft(next);
              if (!sid || !cid) return;
              const ids = next.map((m) => String((m as any).id));
              void reorderMessagesInConversation?.({ scenarioId: sid, conversationId: cid, orderedMessageIds: ids });
            }}
          />
        ) : (
          <FlatList
            ref={(r) => {
              listRef.current = r;
            }}
            data={dataForList}
            keyExtractor={(m) => String((m as any).id)}
            renderItem={renderBubble}
            contentContainerStyle={{ padding: 14, paddingBottom: 24, flexGrow: 1 }}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onLayout={handleListLayout}
            onContentSizeChange={handleContentSizeChange}
            onScrollToIndexFailed={onScrollToIndexFailed}
          />
        )}

        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
          {composerAttachments}
          {/* Typing indicator */}
          {typingProfileIds.length > 0 ? (
            <TypingIndicator
              names={typingProfileIds
                .map((id) => (getProfileById?.(String(id)) as Profile | null)?.displayName ?? "")
                .filter(Boolean)}
              variant="thread"
              color={colors.textSecondary}
            />
          ) : null}
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

            <Pressable
              onPress={onSend}
              disabled={
                sending ||
                !sendAsId ||
                (!String(text ?? "").trim() && (imageUris?.length ?? 0) === 0) ||
                !sendAsAllowedIds.has(String(sendAsId))
              }
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.tint,
                  opacity:
                    sending ||
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
                const body = String(text ?? "").trim();
                if (!sendAsId || !sendAsAllowedIds.has(String(sendAsId))) return;
                if (!body) {
                  Alert.alert("Separator text required", "Type separator text then long-press send to create it.");
                  return;
                }

                if (sendingRef.current) return;
                sendingRef.current = true;
                setSending(true);

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
                } finally {
                  sendingRef.current = false;
                  setSending(false);
                }

                const isSuccess = !!(res && (res.ok === true || (res as any).messageId || (res as any).message));
                if (!isSuccess) {
                  Alert.alert("Could not send", String((res as any)?.error ?? "Send failed"));
                  return;
                }

                setText("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.background} />
              )}
            </Pressable>
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

            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>your profiles</ThemedText>
            {candidates.owned.map((p) => {
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

            <Pressable
              onPress={() => setPublicOpen((v) => !v)}
              hitSlop={10}
              style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.8 }]}
            >
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>
                public profiles
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
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
});