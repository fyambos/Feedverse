// mobile/app/(scenario)/[scenarioId]/(tabs)/messages/index.tsx
import { subscribeToMessageEvents, subscribeToTypingEvents } from "@/context/appData";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/apiClient";

import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import TypingIndicator from "@/components/ui/TypingIndicator";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Avatar } from "@/components/ui/Avatar";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import type { Conversation, Message, Profile } from "@/data/db/schema";

import { useFocusEffect } from "@react-navigation/native";

function scenarioIdFromPathname(pathname: string): string {
  
  const parts = pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const scenarioIdx = parts.findIndex((p) => p === "(scenario)" || p === "scenario");
  const candidate =
    scenarioIdx >= 0
      ? parts[scenarioIdx + 1]
      : parts.length > 0
      ? parts[0]
      : "";

  const raw = String(candidate ?? "").trim();
  if (!raw) return "";
  if (raw === "modal") return "";
  if (raw.startsWith("(")) return "";

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function MessagesScreen() {
    // Force re-render on message event
    const [messageVersion, setMessageVersion] = useState(0);
  // Debug: log messagesMap on every render
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { scenarioId, openConversationId } = useLocalSearchParams<{
    scenarioId: string;
    openConversationId?: string;
  }>();
  const pathname = usePathname();

  const sid = useMemo(() => {
    const fromParams = typeof scenarioId === "string" ? scenarioId.trim() : "";
    if (fromParams) return fromParams;
    return scenarioIdFromPathname(pathname);
  }, [scenarioId, pathname]);

  const app = useAppData() as any;
  const auth = useAuth();
  const {
    isReady,
    db,
    getSelectedProfileId,
    listConversationsForScenario,
    getProfileById,
    listProfilesForScenario,
    syncProfilesForScenario,
    getOrCreateConversation,
    listSendAsProfilesForScenario,
    deleteConversationCascade,
    updateConversationParticipants,
  } = app;

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());

  const [optimisticallyReadIds, setOptimisticallyReadIds] = useState<Set<string>>(() => new Set());

  // Typing indicators map: conversationId -> profileId[]
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({});
  const typingTimersRef = React.useRef<Record<string, Record<string, ReturnType<typeof setTimeout> | null>>>({});

  const selectedProfileId: string | null = useMemo(
    () => (sid ? (getSelectedProfileId?.(sid) ?? null) : null),
    [sid, getSelectedProfileId]
  );

  const openOnceRef = React.useRef<string | null>(null);

  const syncOnceRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;

    if (syncOnceRef.current === sid) return;
    syncOnceRef.current = sid;

    (async () => {
      try {
        await syncProfilesForScenario?.(sid);
        await app?.syncConversationsForScenario?.(sid);
      } catch {
        // ignore
      }
    })();
  }, [isReady, sid, app, syncProfilesForScenario]);

  // Live update: sync conversations when a new message arrives for this scenario
  useEffect(() => {
    if (!sid) return;
    interface MessageEvent {
      scenarioId: string;
      [key: string]: any;
    }

    const handler = (msg: MessageEvent) => {
      const msgSid = String(msg?.scenarioId ?? msg?.scenario_id ?? "").trim();
      if (!msgSid || String(msgSid) !== String(sid)) return;

      // Detect either an event wrapper (with `event`) or a raw message payload (with `id`).
      const isEvent = String(msg.event ?? "").startsWith("message");
      const isRawMessage = Boolean(msg.id);
      if (!isEvent && !isRawMessage) return;

      // Refresh conversations on message.created or when receiving a raw message
      try {
        app?.syncConversationsForScenario?.(sid);
        const convId = String(msg.conversationId ?? msg.conversation_id ?? "").trim();
        if (convId) {
          app?.syncMessagesForConversation?.({ scenarioId: sid, conversationId: convId, limit: 30 });
        }
      } catch {
        // ignore
      }
      setMessageVersion((v) => v + 1); // force re-render
    };
    const unsubscribe = subscribeToMessageEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [sid, app]);

  // Subscribe to typing events and maintain per-conversation typing lists
  useEffect(() => {
    if (!sid) return;
    const handler = (ev: any) => {
      try {
        if (String(ev?.scenarioId ?? "") !== String(sid)) return;
        const convId = String(ev?.conversationId ?? "").trim();
        const pid = String(ev?.profileId ?? "").trim();
        if (!convId || !pid) return;

        setTypingMap((prev) => {
          const next = { ...(prev ?? {}) };
          const existing = Array.isArray(next[convId]) ? [...next[convId]] : [];
          if (ev.typing) {
            if (!existing.includes(pid)) existing.push(pid);
          } else {
            const idx = existing.indexOf(pid);
            if (idx >= 0) existing.splice(idx, 1);
          }
          next[convId] = existing;
          return next;
        });

        // manage per-conversation per-profile timers to clear typing after timeout
        const tmap = (typingTimersRef.current[convId] ??= {});
        if (ev.typing) {
          if (tmap[pid]) clearTimeout(tmap[pid] as any);
          tmap[pid] = setTimeout(() => {
            setTypingMap((prev) => {
              const next = { ...(prev ?? {}) };
              const arr = Array.isArray(next[convId]) ? next[convId].filter((x) => x !== pid) : [];
              next[convId] = arr;
              return next;
            });
            tmap[pid] = null;
          }, 4000);
        } else {
          if (tmap[pid]) {
            clearTimeout(tmap[pid] as any);
            tmap[pid] = null;
          }
        }
      } catch {
        // ignore
      }
    };

    const unsub = (subscribeToMessageEvents as any)(() => {}); // keep message subscription intact
    const unsubTyping = (subscribeToMessageEvents as any) === null ? () => {} : (() => {});
    // Use the dedicated typing subscription if available
    const s = (subscribeToTypingEvents as any)(handler);
    return () => {
      try { s(); } catch {}
      try {
        for (const conv of Object.keys(typingTimersRef.current)) {
          for (const pid of Object.keys(typingTimersRef.current[conv] ?? {})) {
            const t = typingTimersRef.current[conv][pid];
            if (t) clearTimeout(t as any);
          }
        }
      } catch {}
      typingTimersRef.current = {};
    };
  }, [sid]);

    // Unread counts state
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Fetch unread counts for selected profile
  const fetchUnreadCounts = useCallback(() => {
    // console.log("fetchUnreadCounts called", { isReady, sid, selectedProfileId });
    if (!isReady || !sid || !selectedProfileId) {
      // console.log("fetchUnreadCounts skipped", { isReady, sid, selectedProfileId });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = app?.auth?.token ?? auth?.token;
        if (!token) {
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (baseUrl) {
            try {
              Alert.alert("Sign in required", "Please sign in to view unread counts.", [
                { text: "Sign in", onPress: () => router.push("/(auth)/login") },
                { text: "Cancel", style: "cancel" },
              ]);
            } catch {
              // ignore
            }
          }
          // console.log("fetchUnreadCounts: no token, falling back to local DB");
          // fallback: compute unread counts from local DB/messages
          const map: Record<string, number> = {};
          const msgs = (db as any)?.messages ?? {};
          for (const _id of Object.keys(msgs)) {
            const m = msgs[_id];
            const convId = String(m.conversation_id ?? m.conversationId ?? m.convId ?? "");
            if (!convId) continue;
            const read = !!m.read || !!m.is_read || false;
            if (!read) map[convId] = (map[convId] || 0) + 1;
          }
          if (!cancelled) setUnreadCounts(map);
          return;
        }
        // console.log("fetchUnreadCounts: calling API", { sid, selectedProfileId });
        const res = await apiFetch({
          path: `/scenarios/${encodeURIComponent(sid)}/unread?profileId=${encodeURIComponent(selectedProfileId)}`,
          token,
        });
        // console.log("unread API response", res);
        if (res.ok && Array.isArray(res.json?.unread)) {
          const map: Record<string, number> = {};
          for (const row of res.json.unread) {
            map[String(row.conversation_id)] = Number(row.unread_count) || 0;
          }
          if (!cancelled) setUnreadCounts(map);
        } else {
          // console.log("unread API returned no data or unexpected shape", { ok: res.ok, json: res.json });
        }
      } catch (e) {
        // console.log("fetchUnreadCounts error", e);
      }
    })();
    // no return value
  }, [isReady, sid, selectedProfileId, app?.auth?.token, db]);
  
  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Optimistic UI override: once tapped, keep dot hidden until counts truly reach 0

const markOptimisticallyRead = useCallback((conversationId: string) => {
  const cid = String(conversationId ?? "").trim();
  if (!cid) return;
  setOptimisticallyReadIds((prev) => {
    if (prev.has(cid)) return prev;
    const next = new Set(prev);
    next.add(cid);
    return next;
  });
}, []);

  useFocusEffect(
  useCallback(() => {
    fetchUnreadCounts();
    // optional but nice: keep conversations fresh too
    if (sid) app?.syncConversationsForScenario?.(sid);
  }, [fetchUnreadCounts, sid, app])
);

  // Mark a conversation as read (optimistic UI + server/local fallback)
  const markConversationRead = useCallback(
    async (conversationId: string) => {
      const convId = String(conversationId ?? "").trim();
      if (!convId) return;
      if (!isReady || !sid || !selectedProfileId) return;

      markOptimisticallyRead(convId);

      // Optimistic UI: remove the unread dot immediately
      setUnreadCounts((prev) => ({ ...(prev ?? {}), [convId]: 0 }));

      try {
        // Prefer server-side read tracking
        const token = app?.auth?.token ?? auth?.token;
        if (token) {
          await apiFetch({
            // server route expects POST /conversations/:conversationId/read
            path: `/conversations/${encodeURIComponent(convId)}/read`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profileId: String(selectedProfileId) }),
            },
          });
        } else {
          // Fallback: best-effort local mark (if your local message objects support it)
          const msgs = (db as any)?.messages ?? {};
          for (const id of Object.keys(msgs)) {
            const m = msgs[id];
            const midConv = String(m.conversation_id ?? m.conversationId ?? m.convId ?? "");
            if (midConv !== convId) continue;
            if (m.read != null) m.read = true;
            if (m.is_read != null) m.is_read = true;
          }
        }
      } catch {
        // ignore
      } finally {
        // Re-sync counts to ensure UI matches backend
        fetchUnreadCounts();
      }
    },
    [isReady, sid, selectedProfileId, app?.auth?.token, db, fetchUnreadCounts, markOptimisticallyRead]
  );

  

useEffect(() => {
  setOptimisticallyReadIds((prev) => {
    let changed = false;
    const next = new Set(prev);
    for (const id of prev) {
      if ((unreadCounts?.[id] ?? 0) <= 0) {
        next.delete(id);
        changed = true;
      }
    }
    return changed ? next : prev;
  });
}, [unreadCounts]);

useEffect(() => {
  setOptimisticallyReadIds(new Set());
}, [sid, selectedProfileId]);

    // Subscribe to message events to refetch unread counts in real time

    useEffect(() => {
      if (!sid) return;
      interface MessageEvent {
        scenarioId: string;
        [key: string]: any;
      }

      const handler = (msg: MessageEvent) => {
        if (String(msg.scenarioId) === String(sid)) {
          // console.log("message event for sid received, refetching unread counts", msg);
          fetchUnreadCounts();
        }
      };
      const unsubscribe = subscribeToMessageEvents(handler);
      return () => {
        unsubscribe(); // Don't return the result
      };
    }, [sid, app, fetchUnreadCounts]);


  useEffect(() => {
    const cid = typeof openConversationId === "string" ? openConversationId.trim() : "";
    if (!cid) return;
    if (!isReady) return;
    if (!sid) return;
    if (!selectedProfileId) return;

    if (openOnceRef.current === cid) return;
    openOnceRef.current = cid;

    // clear the param so we don't re-open on re-render
    router.setParams({ openConversationId: undefined } as any);

    void markConversationRead(cid);
    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
      params: { scenarioId: sid, conversationId: cid },
    } as any);
  }, [openConversationId, isReady, sid, selectedProfileId, markConversationRead]);

  const messagesMap: Record<string, Message> = useMemo(() => ((db as any)?.messages ?? {}) as any, [db, messageVersion]);

  const inboxLastMessageAtByConversationId: Record<string, string> = useMemo(() => {
    if (!isReady) return {};
    if (!sid) return {};

    const best: Record<string, string> = {};
    for (const m of Object.values(messagesMap)) {
      if (String((m as any).scenarioId ?? "") !== String(sid)) continue;
      const cid = String((m as any).conversationId ?? "");
      if (!cid) continue;
      const t = String((m as any).createdAt ?? "");
      if (!t) continue;
      if (!best[cid] || t > best[cid]) best[cid] = t;
    }
    return best;
  }, [isReady, sid, messagesMap, messageVersion]);

  // Build the conversation list from messagesMap for live updates
  const conversations: Conversation[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    if (!selectedProfileId) return [];

    // Find all unique conversation IDs for this scenario/profile
    const convMap: Record<string, Conversation> = {};
    for (const m of Object.values(messagesMap)) {
      if (String((m as any).scenarioId ?? "") !== String(sid)) continue;
      const cid = String((m as any).conversationId ?? "");
      if (!cid) continue;
      // Only include conversations where the selected profile is a participant
      const conv = (db as any)?.conversations?.[cid];
      if (!conv) continue;
      if (!Array.isArray(conv.participantProfileIds) || !conv.participantProfileIds.includes(selectedProfileId)) continue;
      convMap[cid] = conv;
    }
    // Also include local DB conversations as a fallback so they appear
    // even when messages are missing/cleared locally. This prevents the
    // UI from showing an empty inbox until a new message arrives.
    try {
      const allConvs = (db as any)?.conversations ?? {};
      for (const [cid, conv] of Object.entries(allConvs)) {
        if (convMap[cid]) continue; // already included from messages
        const convObj: any = conv as any;
        // Ensure it's for the same scenario (try a few common field names)
        const convSid = String(convObj.scenarioId ?? convObj.scenario_id ?? convObj.scenario ?? "");
        if (sid && convSid && String(convSid) !== String(sid)) continue;
        if (!Array.isArray(convObj.participantProfileIds) || !convObj.participantProfileIds.includes(selectedProfileId)) continue;
        convMap[String(cid)] = conv as Conversation;
      }
    } catch {
      // ignore
    }
    const items = Object.values(convMap);
    // Debug: log conversations and their latest message
    const debugConvs = items.map((c) => {
      const cid = String((c as any).id ?? "");
      let latestMsg: Message | null = null;
      for (const m of Object.values(messagesMap)) {
        if (String((m as any).conversationId) !== cid) continue;
        if (String((m as any).scenarioId) !== String(sid)) continue;
        if (!latestMsg || String((m as any).createdAt ?? "") > String((latestMsg as any).createdAt ?? "")) {
          latestMsg = m;
        }
      }
      return {
        conversationId: cid,
        title: (c as any).title,
        latestMsgId: latestMsg?.id,
        latestMsgText: latestMsg?.text,
        latestMsgCreatedAt: latestMsg?.createdAt,
      };
    });
    
    return items.slice().sort((a, b) => {
      const aId = String((a as any).id ?? "");
      const bId = String((b as any).id ?? "");
      const aT =
        inboxLastMessageAtByConversationId[aId] ??
        String((a as any).lastMessageAt ?? (a as any).updatedAt ?? (a as any).createdAt ?? "");
      const bT =
        inboxLastMessageAtByConversationId[bId] ??
        String((b as any).lastMessageAt ?? (b as any).updatedAt ?? (b as any).createdAt ?? "");
      const c = String(bT).localeCompare(String(aT));
      if (c !== 0) return c;
      return String(bId).localeCompare(String(aId));
    });
  }, [isReady, sid, selectedProfileId, db, messagesMap, inboxLastMessageAtByConversationId, messageVersion]);

  const allScenarioProfiles: Profile[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    return (listProfilesForScenario?.(sid) ?? []) as Profile[];
  }, [isReady, sid, listProfilesForScenario, db]);

  const pickableProfiles: Profile[] = useMemo(() => {
    const me = String(selectedProfileId ?? "");
    return allScenarioProfiles
      .filter((p) => String((p as any).id ?? "") && String((p as any).id) !== me)
      .sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
  }, [allScenarioProfiles, selectedProfileId]);

  const sendAsCandidates = useMemo(() => {
    if (!sid) return { owned: [] as Profile[], public: [] as Profile[] };
    return (listSendAsProfilesForScenario?.(sid) ?? { owned: [], public: [] }) as {
      owned: Profile[];
      public: Profile[];
    };
  }, [sid, listSendAsProfilesForScenario]);

  const canManageChatsAsSelected = useMemo(() => {
    const me = String(selectedProfileId ?? "");
    if (!me) return false;
    return [...(sendAsCandidates.owned ?? []), ...(sendAsCandidates.public ?? [])].some(
      (p) => String((p as any).id ?? "") === me
    );
  }, [sendAsCandidates, selectedProfileId]);

  const ownedProfileIds = useMemo(() => {
    return new Set((sendAsCandidates.owned ?? []).map((p) => String((p as any).id ?? "")).filter(Boolean));
  }, [sendAsCandidates.owned]);

  const getLastMessageForConversation = (conversationId: string): Message | null => {
    const cid = String(conversationId);
    let best: Message | null = null;
    for (const m of Object.values(messagesMap)) {
      if (String((m as any).conversationId) !== cid) continue;
      if (String((m as any).scenarioId) !== String(sid)) continue;
      if (!best) {
        best = m;
        continue;
      }
      const a = String((best as any).createdAt ?? "");
      const b = String((m as any).createdAt ?? "");
      if (b > a) best = m;
    }
    return best;
  };

  const getConversationTitleAndAvatar = (c: Conversation): { title: string; avatarUrl: string | null } => {
      const customTitle = String((c as any)?.title ?? "").trim();
      const customAvatar = String((c as any)?.avatarUrl ?? "").trim();
      if (customTitle || customAvatar) {
        return {
          title: customTitle || "group chat",
          avatarUrl: customAvatar || null,
        };
      }

    const ids = Array.isArray((c as any).participantProfileIds) ? (c as any).participantProfileIds.map(String) : [];
    const others = ids.filter((id: string) => id && id !== String(selectedProfileId ?? ""));

    if (others.length === 1) {
      const p: Profile | null = getProfileById?.(String(others[0])) ?? null;
      return {
        title: p?.displayName ? String(p.displayName) : "conversation",
        avatarUrl: p?.avatarUrl ?? null,
      };
    }

    if (others.length > 1) {
      return { title: "group chat", avatarUrl: null };
    }

    return { title: "you", avatarUrl: null };
  };

  if (!isReady) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.center}>
            <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={28} color={colors.tint} />
            </View>
            <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>loading…</ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!sid) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.center}>
            <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={28} color={colors.tint} />
            </View>
            <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>missing scenario id.</ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!selectedProfileId) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.center}>
            <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={28} color={colors.tint} />
            </View>
            <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>select a profile to view DMs.</ThemedText>

            <Pressable
              onPress={() => {
                router.push({
                  pathname: "/modal/select-profile",
                  params: { scenarioId: sid },
                } as any);
              }}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: pressed ? colors.pressed : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <ThemedText style={[styles.ctaText, { color: colors.text }]}>choose profile</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const togglePicked = (profileId: string) => {
    const pid = String(profileId);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const createConversation = async () => {
    const base = String(selectedProfileId ?? "");
    if (!base) return;

    const participantProfileIds = [base, ...Array.from(picked)];
    // Pass selectedProfileId to getOrCreateConversation
    const res = await getOrCreateConversation?.({ scenarioId: sid, participantProfileIds, selectedProfileId: base });
    if (!res?.ok) return;

    const conversationId = String(res.conversationId);
    setComposerOpen(false);
    setPicked(new Set());
    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
      params: { scenarioId: sid, conversationId },
    } as any);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.containerList, { backgroundColor: colors.background }]}>
        <Modal
          visible={composerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setComposerOpen(false)}
        >
          <SafeAreaView edges={["top", "bottom"]} style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => {
                setComposerOpen(false);
                setPicked(new Set());
              }}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>

            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>new conversation</ThemedText>

            <Pressable
              onPress={createConversation}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <ThemedText style={[styles.modalAction, { color: colors.tint }]}>create</ThemedText>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
            <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              pick participants (optional). create with none to DM yourself.
            </ThemedText>
          </View>

            <FlatList
              data={pickableProfiles}
              keyExtractor={(p) => String((p as any).id)}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
                const p = item as Profile;
                const pid = String((p as any).id);
                const selected = picked.has(pid);
                return (
                  <Pressable
                    onPress={() => togglePicked(pid)}
                    style={({ pressed }) => [
                      styles.pickRow,
                      {
                        backgroundColor: pressed ? colors.pressed : colors.background,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Avatar uri={(p as any).avatarUrl ?? null} size={40} fallbackColor={colors.border} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={[styles.pickName, { color: colors.text }]} numberOfLines={1}>
                        {String((p as any).displayName ?? "profile")}
                      </ThemedText>
                      {!!(p as any).handle && (
                        <ThemedText style={[styles.pickHandle, { color: colors.textSecondary }]} numberOfLines={1}>
                          @{String((p as any).handle).replace(/^@+/, "")}
                        </ThemedText>
                      )}
                    </View>
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={22}
                      color={selected ? colors.tint : colors.textSecondary}
                    />
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </Modal>

        <FlatList
          data={conversations}
          keyExtractor={(c) => String((c as any).id)}
          contentContainerStyle={{ paddingBottom: 10 }}
          extraData={messageVersion}
          ListHeaderComponent={() => {
            return (
              <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                <ThemedText style={[styles.headerTitle, { color: colors.text }]}>messages</ThemedText>
                <Pressable
                  onPress={() => {
                    (async () => {
                      try {
                        await syncProfilesForScenario?.(sid);
                      } catch {
                        // ignore
                      }
                      setComposerOpen(true);
                    })();
                  }}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.plus,
                    {
                      backgroundColor: pressed ? colors.pressed : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={() => {
            return (
              <View style={styles.emptyWrap}>
                <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>your inbox is empty for this profile.</ThemedText>
              </View>
            );
          }}
          renderItem={({ item }) => {
            const c = item as Conversation;
            const convId = String((c as any).id);
            const meta = getConversationTitleAndAvatar(c);

            // Always show the latest message text as preview (live)

            // Always compute the latest message for this conversation from messagesMap
            let preview = "";
            let latestMsg: Message | null = null;
            // Debug: print all messages for this conversation, sorted by createdAt
            if (convId === "422bb9dd-46c6-4d26-b9d1-c7b536ef4378") {
              // Print sid and scenarioId for each message
              const allMsgs = Object.values(messagesMap).filter(m => String((m as any).conversationId) === convId);
              
              const convMsgs = allMsgs
                .filter(m => String((m as any).scenarioId) === String(sid))
                .sort((a, b) => String((a as any).createdAt ?? "").localeCompare(String((b as any).createdAt ?? "")));
              
            }
            for (const m of Object.values(messagesMap)) {
              if (String((m as any).conversationId) !== convId) continue;
              if (String((m as any).scenarioId) !== String(sid)) continue;
              if (!latestMsg || String((m as any).createdAt ?? "") > String((latestMsg as any).createdAt ?? "")) {
                latestMsg = m;
              }
            }
            // Debug: log preview computation for each conversation
            
            if (latestMsg && latestMsg.text) preview = String(latestMsg.text);

            const parts = Array.isArray((c as any).participantProfileIds)
              ? (c as any).participantProfileIds.map(String).filter(Boolean)
              : [];
            const isGroup = parts.length > 2;
            const canHardDelete = parts.length > 0 && parts.every((pid: string) => ownedProfileIds.has(String(pid)));

            const onDelete = async () => {
              if (!canManageChatsAsSelected) return;
              if (!sid || !selectedProfileId) return;

              try {
                if (canHardDelete) {
                  await deleteConversationCascade?.({ scenarioId: sid, conversationId: convId });
                  return;
                }

                const nextParts = parts.filter((pid: string) => String(pid) !== String(selectedProfileId));
                if (nextParts.length === 0) {
                  await deleteConversationCascade?.({ scenarioId: sid, conversationId: convId });
                  return;
                }

                await updateConversationParticipants?.({
                  scenarioId: sid,
                  conversationId: convId,
                  participantProfileIds: nextParts,
                });
              } catch {
                // ignore
              }
            };

            const onEdit = () => {
              if (!sid) return;
              if (isGroup) {
                router.push({ pathname: "/modal/edit-groupchat", params: { scenarioId: sid, conversationId: convId } } as any);
                return;
              }

              // 1:1 doesn't have editable title/avatar; treat edit as open
              router.push({
                pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
                params: { scenarioId: sid, conversationId: convId },
              } as any);
            };

            const unread = unreadCounts[convId] > 0;
            return (
              <SwipeableRow
                enabled={canManageChatsAsSelected}
                colors={{ tint: colors.tint, pressed: colors.pressed }}
                rightThreshold={40}
                onEdit={onEdit}
                onDelete={() => {
                  Alert.alert(
                    canHardDelete ? "Delete chat?" : "Leave chat?",
                    canHardDelete
                      ? "This will remove the chat and its messages."
                      : "This will remove the chat from this profile only.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: canHardDelete ? "Delete" : "Leave", style: "destructive", onPress: onDelete },
                    ]
                  );
                }}
              >
                <Pressable
                  onPress={() => {
                    void markConversationRead(convId);
                    router.push({
                      pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
                      params: { scenarioId: sid, conversationId: convId },
                    } as any);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? colors.pressed : colors.background,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Avatar uri={meta.avatarUrl} size={42} fallbackColor={colors.border} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowTop}>
                      <ThemedText style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                        {meta.title}
                      </ThemedText>
                    </View>
                    {!!preview && (
                      <ThemedText style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {preview}
                      </ThemedText>
                    )}
                  </View>
                  {unread && (
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.tint, marginLeft: 8 }} />
                  )}
                </Pressable>
              </SwipeableRow>
            );
          }}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  containerList: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: { fontSize: 17, fontWeight: "800", flexShrink: 1 },
  rowSubtitle: { fontSize: 14, marginTop: 1 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 20, textAlign: "center", maxWidth: 320, marginTop: 2 },
  cta: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: { fontSize: 15, fontWeight: "800" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontWeight: "900" },
  plus: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyWrap: { paddingHorizontal: 16, paddingTop: 14 },

  modal: { flex: 1 },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  modalAction: { fontSize: 15, fontWeight: "900" },
  modalSubtitle: { fontSize: 13, lineHeight: 18 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickName: { fontSize: 15, fontWeight: "900" },
  pickHandle: { fontSize: 13, marginTop: 2 },
});

