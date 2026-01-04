import React, { useEffect, useMemo } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const {
    isReady,
    db,
    getSelectedProfileId,
    listConversationsForScenario,
    getProfileById,
    listProfilesForScenario,
    getOrCreateConversation,
  } = app;

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());

  const selectedProfileId: string | null = useMemo(
    () => (sid ? (getSelectedProfileId?.(sid) ?? null) : null),
    [sid, getSelectedProfileId]
  );

  const openOnceRef = React.useRef<string | null>(null);

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

    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
      params: { scenarioId: sid, conversationId: cid },
    } as any);
  }, [openConversationId, isReady, sid, selectedProfileId]);

  const conversations: Conversation[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    if (!selectedProfileId) return [];
    return (listConversationsForScenario?.(sid, selectedProfileId) ?? []) as Conversation[];
  }, [isReady, sid, selectedProfileId, listConversationsForScenario]);

  const messagesMap: Record<string, Message> = ((db as any)?.messages ?? {}) as any;

  const allScenarioProfiles: Profile[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    return (listProfilesForScenario?.(sid) ?? []) as Profile[];
  }, [isReady, sid, listProfilesForScenario]);

  const pickableProfiles: Profile[] = useMemo(() => {
    const me = String(selectedProfileId ?? "");
    return allScenarioProfiles
      .filter((p) => String((p as any).id ?? "") && String((p as any).id) !== me)
      .sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
  }, [allScenarioProfiles, selectedProfileId]);

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
    const res = await getOrCreateConversation?.({ scenarioId: sid, participantProfileIds });
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
          ListHeaderComponent={() => {
            return (
              <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                <ThemedText style={[styles.headerTitle, { color: colors.text }]}>messages</ThemedText>
                <Pressable
                  onPress={() => setComposerOpen(true)}
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
