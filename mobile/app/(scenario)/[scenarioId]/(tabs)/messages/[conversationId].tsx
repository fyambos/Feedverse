import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import type { Conversation, Message, Profile } from "@/data/db/schema";
import { AuthorAvatarPicker } from "@/components/postComposer/AuthorAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { SwipeableRow } from "@/components/ui/SwipeableRow";

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
  const [sendAsId, setSendAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publicOpen, setPublicOpen] = useState(false);

  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<Message[] | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [editSenderId, setEditSenderId] = useState<string | null>(null);
  const [editPublicOpen, setEditPublicOpen] = useState(false);

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

  const listRef = useRef<FlatList<Message> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return;
    if (messages.length === 0) return;
    // with non-inverted list, bottom = last index
    listRef.current.scrollToIndex({ index: Math.max(0, messages.length - 1), animated: true });
  }, [messages.length]);

  useEffect(() => {
    // keep you near the latest
    if (!reorderMode) scrollToBottom();
  }, [messages.length, scrollToBottom, reorderMode]);

  useEffect(() => {
    if (!reorderMode) {
      setReorderDraft(null);
      return;
    }
    setReorderDraft(messages);
  }, [reorderMode, messages]);

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

  const eligibleEditSenders: Profile[] = useMemo(() => {
    const out: Profile[] = [];
    for (const pid of participantIds) {
      const id = String(pid ?? "").trim();
      if (!id) continue;
      if (!sendAsAllowedIds.has(id)) continue;
      const p: Profile | null = getProfileById?.(id) ?? null;
      if (p) out.push(p);
    }
    out.sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
    return out;
  }, [participantIds, sendAsAllowedIds, getProfileById]);

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
      if (!sendAsAllowedIds.has(senderId)) return;

      setEditMessageId(mid);
      setEditText(String((m as any).text ?? ""));
      setEditSenderId(senderId);
      setEditOpen(true);
    },
    [sendAsAllowedIds]
  );

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditMessageId(null);
    setEditText("");
    setEditSenderId(null);
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (!sid) return;
    if (!editMessageId) return;

    const body = String(editText ?? "").trim();
    const from = String(editSenderId ?? "").trim();
    if (!body) return;
    if (!from) return;
    if (!sendAsAllowedIds.has(from)) return;

    await updateMessage?.({
      scenarioId: sid,
      messageId: String(editMessageId),
      text: body,
      senderProfileId: from,
    });

    closeEdit();
  }, [sid, editMessageId, editText, editSenderId, sendAsAllowedIds, updateMessage, closeEdit]);

  const onDeleteEdit = useCallback(async () => {
    if (!sid) return;
    if (!editMessageId) return;
    await deleteMessage?.({ scenarioId: sid, messageId: String(editMessageId) });
    closeEdit();
  }, [sid, editMessageId, deleteMessage, closeEdit]);

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
    if (!body) return;

    const res = await sendMessage?.({
      scenarioId: sid,
      conversationId: cid,
      senderProfileId: String(sendAsId),
      text: body,
    });

    if (res?.ok) setText("");
  }, [sid, cid, sendAsId, text, sendMessage]);

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

    const canSwipeEdit = !reorderMode && sendAsAllowedIds.has(senderId);

    const showLeftAvatar = !isRight && !isOneToOne;
    const showSenderNameAbove = !isRight && !isOneToOne;

    const row = (
      <Pressable
        onLongPress={() => {
          if (!reorderMode) {
            setReorderMode(true);
            return;
          }
          opts?.drag?.();
        }}
        delayLongPress={180}
        style={({ pressed }) => [
          pressed && { opacity: 0.92 },
          opts?.active ? { opacity: 0.85 } : null,
        ]}
      >
        <View style={[styles.bubbleRow, { justifyContent: isRight ? "flex-end" : "flex-start" }]}>
        {showLeftAvatar ? <Avatar uri={sender?.avatarUrl ?? null} size={26} fallbackColor={colors.border} /> : null}

        <View style={{ maxWidth: "78%" }}>
          {showSenderNameAbove ? (
            <ThemedText style={[styles.senderNameAbove, { color: colors.textSecondary }]} numberOfLines={1}>
              {sender?.displayName ? String(sender.displayName) : "unknown"}
            </ThemedText>
          ) : null}

          <View
            style={[
              styles.bubble,
              {
                backgroundColor: isRight ? colors.tint : colors.card,
                borderWidth: 0,
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
          await deleteMessage?.({ scenarioId: sid, messageId: mid });
        }}
      >
        {row}
      </SwipeableRow>
    );
  };

  const renderBubble = ({ item }: { item: Message }) => renderBubbleRow(item);

  const dataForList = reorderMode ? reorderDraft ?? messages : messages;

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
              <Avatar uri={headerAvatarUrl} size={38} fallbackColor={colors.border} />
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
        {reorderMode ? (
          <DraggableFlatList
            data={dataForList}
            keyExtractor={(m) => String((m as any).id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 10 }}
            activationDistance={12}
            dragItemOverflow
            renderItem={({ item, drag, isActive }: RenderItemParams<Message>) => renderBubbleRow(item, { drag, active: isActive })}
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
            contentContainerStyle={{ padding: 14, paddingBottom: 10 }}
            onScrollToIndexFailed={() => {
              // ignore (small lists)
            }}
          />
        )}

        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
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
              onChangeText={setText}
              placeholder="message…"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, backgroundColor: colors.card }]}
              multiline
            />

            <Pressable
              onPress={onSend}
              disabled={!sendAsId || !String(text ?? "").trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.tint,
                  opacity: !sendAsId || !String(text ?? "").trim() ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={18} color={colors.background} />
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={closePicker}>
        <Pressable style={[styles.pickerBackdrop, { backgroundColor: colors.modalBackdrop }]} onPress={closePicker}>
          <Pressable
            style={[styles.pickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={styles.pickerHeader}>
              <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
                send as
              </ThemedText>
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
});