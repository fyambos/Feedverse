import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, usePathname } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Avatar } from "@/components/ui/Avatar";
import type { Conversation, Message, Profile } from "@/data/db/schema";

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
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const pathname = usePathname();

  const sid = useMemo(() => {
    const fromParams = typeof scenarioId === "string" ? scenarioId.trim() : "";
    if (fromParams) return fromParams;
    return scenarioIdFromPathname(pathname);
  }, [scenarioId, pathname]);

  const app = useAppData() as any;
  const { isReady, db, getSelectedProfileId, listConversationsForScenario, getProfileById } = app;

  const selectedProfileId: string | null = useMemo(
    () => (sid ? (getSelectedProfileId?.(sid) ?? null) : null),
    [sid, getSelectedProfileId]
  );

  const conversations: Conversation[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    if (!selectedProfileId) return [];
    return (listConversationsForScenario?.(sid, selectedProfileId) ?? []) as Conversation[];
  }, [isReady, sid, selectedProfileId, listConversationsForScenario]);

  const messagesMap: Record<string, Message> = ((db as any)?.messages ?? {}) as any;

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

    return { title: "conversation", avatarUrl: null };
  };

  if (!isReady) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={28} color={colors.tint} />
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>loading…</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!sid) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={28} color={colors.tint} />
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>missing scenario id.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!selectedProfileId) {
    return (
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
    );
  }

  if (conversations.length === 0) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={28} color={colors.tint} />
          </View>

          <ThemedText style={[styles.title, { color: colors.text }]}>messages</ThemedText>

          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            your inbox is empty for this profile.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.containerList, { backgroundColor: colors.background }]}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => String((c as any).id)}
        contentContainerStyle={{ paddingVertical: 10 }}
        renderItem={({ item }) => {
          const c = item as Conversation;
          const convId = String((c as any).id);
          const meta = getConversationTitleAndAvatar(c);
          const last = getLastMessageForConversation(convId);
          const preview = last?.text ? String(last.text) : "";

          return (
            <Pressable
              onPress={() => {
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

              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          );
        }}
      />
    </ThemedView>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: { fontSize: 16, fontWeight: "900", flexShrink: 1 },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
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
});
