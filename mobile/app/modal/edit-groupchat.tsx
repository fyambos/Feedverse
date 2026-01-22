import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Alert } from "@/context/dialog";
import type { Conversation, Profile } from "@/data/db/schema";
import { Avatar } from "@/components/ui/Avatar";
import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { formatErrorMessage } from "@/lib/utils/format";

export default function EditGroupChatModal() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { scenarioId, conversationId } = useLocalSearchParams<{ scenarioId: string; conversationId: string }>();
  const sid = String(scenarioId ?? "").trim();
  const cid = String(conversationId ?? "").trim();

  const app = useAppData() as any;
  const {
    isReady,
    getConversationById,
    getProfileById,
    listProfilesForScenario,
    updateConversationMeta,
    updateConversationParticipants,
  } = app;

  const conversation: Conversation | null = useMemo(
    () => (cid ? (getConversationById?.(cid) ?? null) : null),
    [cid, getConversationById]
  );

  const initialParticipants: string[] = useMemo(() => {
    const arr = Array.isArray((conversation as any)?.participantProfileIds)
      ? (conversation as any).participantProfileIds.map(String).filter(Boolean)
      : [];
    return Array.from(new Set(arr));
  }, [conversation]);

  const [title, setTitle] = useState<string>(String((conversation as any)?.title ?? ""));
  const [avatarUrl, setAvatarUrl] = useState<string>(String((conversation as any)?.avatarUrl ?? ""));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialParticipants));
  const [busy, setBusy] = useState(false);

  const allScenarioProfiles: Profile[] = useMemo(() => {
    if (!isReady) return [];
    if (!sid) return [];
    return (listProfilesForScenario?.(sid) ?? []) as Profile[];
  }, [isReady, sid, listProfilesForScenario]);

  const currentProfiles: Profile[] = useMemo(() => {
    const out: Profile[] = [];
    for (const pid of Array.from(selectedIds)) {
      const p: Profile | null = getProfileById?.(String(pid)) ?? null;
      if (p) out.push(p);
    }
    out.sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
    return out;
  }, [selectedIds, getProfileById]);

  const addableProfiles: Profile[] = useMemo(() => {
    const out: Profile[] = [];
    for (const p of allScenarioProfiles) {
      const id = String((p as any).id ?? "");
      if (!id) continue;
      if (selectedIds.has(id)) continue;
      out.push(p);
    }
    out.sort((a, b) => String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? "")));
    return out;
  }, [allScenarioProfiles, selectedIds]);

  const onRemoveParticipant = useCallback((pid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(String(pid));
      return next;
    });
  }, []);

  const onAddParticipant = useCallback((pid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(String(pid));
      return next;
    });
  }, []);

  const onPickAvatar = useCallback(async () => {
    const uri = await pickAndPersistOneImage({ persistAs: "avatar", allowsEditing: true, aspect: [1, 1] });
    if (!uri) return;
    setAvatarUrl(String(uri));
  }, []);

  const onSave = useCallback(async () => {
    if (!sid || !cid) return;

    const ids = Array.from(selectedIds).map(String).filter(Boolean);
    if (ids.length < 2) {
      Alert.alert("Need 2+ participants", "Group chats must have at least two participants.");
      return;
    }

    try {
      setBusy(true);
      await updateConversationMeta?.({
        scenarioId: sid,
        conversationId: cid,
        title: title.trim() ? title.trim() : null,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      await updateConversationParticipants?.({
        scenarioId: sid,
        conversationId: cid,
        participantProfileIds: ids,
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Could not save", formatErrorMessage(e, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }, [sid, cid, selectedIds, title, avatarUrl, updateConversationMeta, updateConversationParticipants]);

  if (!isReady || !sid || !cid || !conversation) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={styles.center}>
          <ThemedText style={[styles.title, { color: colors.text }]}>edit group chat</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>loading…</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}> 
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.7 }]}> 
          <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>Cancel</ThemedText>
        </Pressable>

        <ThemedText style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>Edit group chat</ThemedText>

        <Pressable
          onPress={onSave}
          disabled={busy}
          hitSlop={10}
          style={({ pressed }) => [pressed && { opacity: 0.7 }, busy && { opacity: 0.5 }]}
        >
            <ThemedText style={{ color: colors.tint, fontWeight: "900", fontSize: 16 }}>Done</ThemedText>
        </Pressable>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(24, insets.bottom + 24) }}>
        <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>name</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="group chat name"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        />

        <View style={{ height: 14 }} />

        <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>picture</ThemedText>
        <View style={[styles.avatarRow, { borderColor: colors.border, backgroundColor: colors.card }]}> 
          <Pressable onPress={onPickAvatar} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <Avatar uri={avatarUrl || null} size={54} fallbackColor={colors.border} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
              Tap to change
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
              square image works best
            </ThemedText>
          </View>

          {avatarUrl ? (
            <Pressable
              onPress={() => setAvatarUrl("")}
              hitSlop={10}
              style={({ pressed }) => [styles.clearBtn, { borderColor: colors.border }, pressed && { opacity: 0.75 }]}
            >
              <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>Clear</ThemedText>
            </Pressable>
          ) : null}
        </View>

        <View style={{ height: 18 }} />

        <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>participants</ThemedText>

        {currentProfiles.map((p) => {
          const pid = String((p as any).id ?? "");
          return (
            <View key={pid} style={[styles.partRow, { borderColor: colors.border, backgroundColor: colors.card }]}> 
              <Avatar uri={String((p as any).avatarUrl ?? "") || null} size={34} fallbackColor={colors.border} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                  {String((p as any).displayName ?? "")}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  @{String((p as any).handle ?? "")}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => onRemoveParticipant(pid)}
                hitSlop={10}
                style={({ pressed }) => [styles.removeBtn, { borderColor: colors.border }, pressed && { opacity: 0.75 }]}
              >
                <ThemedText style={{ color: colors.textSecondary, fontWeight: "900" }}>Remove</ThemedText>
              </Pressable>
            </View>
          );
        })}

        {addableProfiles.length > 0 ? (
          <>
            <View style={{ height: 16 }} />
            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>add people</ThemedText>
            {addableProfiles.map((p) => {
              const pid = String((p as any).id ?? "");
              return (
                <Pressable
                  key={pid}
                  onPress={() => onAddParticipant(pid)}
                  style={({ pressed }) => [
                    styles.addRow,
                    { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.card },
                  ]}
                >
                  <Avatar uri={String((p as any).avatarUrl ?? "") || null} size={34} fallbackColor={colors.border} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                      {String((p as any).displayName ?? "")}
                    </ThemedText>
                    <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      @{String((p as any).handle ?? "")}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>Add</ThemedText>
                </Pressable>
              );
            })}
          </>
        ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  title: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", maxWidth: 320 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  sectionTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" },

  input: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  avatarRow: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  clearBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  partRow: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  removeBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  addRow: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
