import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import type { Conversation, Message, Profile } from "@/data/db/schema";
import { AuthorAvatarPicker } from "@/components/postComposer/AuthorAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";

export default function ConversationThreadScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { scenarioId, conversationId } = useLocalSearchParams<{ scenarioId: string; conversationId: string }>();

  const sid = String(scenarioId ?? "");
  const cid = String(conversationId ?? "");

  const app = useAppData() as any;
  const { isReady, db, getSelectedProfileId, getConversationById, getProfileById, listSendAsProfilesForScenario, sendMessage } = app;

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
    if (isOneToOne && otherProfileId) {
      const p: Profile | null = getProfileById?.(String(otherProfileId)) ?? null;
      return p?.displayName ? String(p.displayName) : "conversation";
    }
    return "group chat";
  }, [conversation, isOneToOne, otherProfileId, getProfileById]);

  const [text, setText] = useState<string>("");
  const [sendAsId, setSendAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const messagesMap: Record<string, Message> = ((db as any)?.messages ?? {}) as any;
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
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const onPressToggleOneToOne = useCallback(() => {
    if (!isOneToOne) return;
    if (!selectedProfileId || !otherProfileId) return;
    const me = String(selectedProfileId);
    const other = String(otherProfileId);
    const current = String(sendAsId ?? me);
    setSendAsId(current === me ? other : me);
  }, [isOneToOne, selectedProfileId, otherProfileId, sendAsId]);

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

  const candidates = useMemo(() => {
    if (!sid) return { owned: [] as Profile[], public: [] as Profile[] };
    return (listSendAsProfilesForScenario?.(sid) ?? { owned: [], public: [] }) as {
      owned: Profile[];
      public: Profile[];
    };
  }, [sid, listSendAsProfilesForScenario]);

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

  const renderBubble = ({ item }: { item: Message }) => {
    const senderId = String((item as any).senderProfileId ?? "");
    const isRight = senderId === String(selectedProfileId ?? "");
    const sender: Profile | null = senderId ? (getProfileById?.(senderId) ?? null) : null;

    return (
      <View
        style={[
          styles.bubbleRow,
          { justifyContent: isRight ? "flex-end" : "flex-start" },
        ]}
      >
        {!isRight ? (
          <Avatar uri={sender?.avatarUrl ?? null} size={26} fallbackColor={colors.border} />
        ) : null}

        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isRight ? colors.card : colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          {!isRight && !isOneToOne ? (
            <ThemedText style={[styles.senderName, { color: colors.textSecondary }]} numberOfLines={1}>
              {sender?.displayName ? String(sender.displayName) : "unknown"}
            </ThemedText>
          ) : null}

          <ThemedText style={[styles.bubbleText, { color: colors.text }]}>
            {String((item as any).text ?? "")}
          </ThemedText>
        </View>
      </View>
    );
  };

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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
              you: {receiverProfile?.displayName ? String(receiverProfile.displayName) : ""}
            </ThemedText>
          </View>

          <View style={{ width: 34 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={(r) => {
            listRef.current = r;
          }}
          data={messages}
          keyExtractor={(m) => String((m as any).id)}
          renderItem={renderBubble}
          contentContainerStyle={{ padding: 14, paddingBottom: 10 }}
          onScrollToIndexFailed={() => {
            // ignore (small lists)
          }}
        />

        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {isOneToOne ? (
            <Pressable
              onPress={onPressToggleOneToOne}
              hitSlop={10}
              style={({ pressed }) => [styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel="Switch sender"
            >
              <Ionicons name="swap-horizontal" size={18} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ alignItems: "center" }}>
              <AuthorAvatarPicker
                colors={colors}
                avatarUrl={sendAsProfile?.avatarUrl ?? null}
                onPress={openPicker}
              />
            </View>
          )}

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="message…"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            multiline
          />

          <Pressable
            onPress={onSend}
            disabled={!sendAsId || !String(text ?? "").trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: colors.text,
                opacity: !sendAsId || !String(text ?? "").trim() ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Ionicons name="send" size={16} color={colors.background} />
          </Pressable>
        </View>
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

            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>public profiles</ThemedText>
            {candidates.public.map((p) => {
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
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  senderName: { fontSize: 11, fontWeight: "900", marginBottom: 4, letterSpacing: 0.3 },
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
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
});