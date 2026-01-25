import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { RowCard } from "@/components/ui/RowCard";
import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { Alert } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/utils/format";

type ScenarioNotificationPrefsDraft = {
  mentionsEnabled: boolean;
  repliesEnabled: boolean;
  messagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  likesEnabled: boolean;
  repostsEnabled: boolean;
  quotesEnabled: boolean;
  ignoredProfileIds: string[];
};

function normalizePrefs(input: any): ScenarioNotificationPrefsDraft {
  return {
    mentionsEnabled: input?.mentionsEnabled ?? input?.mentions_enabled ?? true,
    repliesEnabled: input?.repliesEnabled ?? input?.replies_enabled ?? true,
    messagesEnabled: input?.messagesEnabled ?? input?.messages_enabled ?? true,
    groupMessagesEnabled: input?.groupMessagesEnabled ?? input?.group_messages_enabled ?? true,
    likesEnabled: input?.likesEnabled ?? input?.likes_enabled ?? true,
    repostsEnabled: input?.repostsEnabled ?? input?.reposts_enabled ?? true,
    quotesEnabled: input?.quotesEnabled ?? input?.quotes_enabled ?? true,
    ignoredProfileIds: Array.isArray(input?.ignoredProfileIds)
      ? input.ignoredProfileIds.map(String).filter(Boolean)
      : Array.isArray(input?.ignored_profile_ids)
        ? input.ignored_profile_ids.map(String).filter(Boolean)
        : [],
  };
}

export default function ScenarioNotificationSettingsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const params = useLocalSearchParams();
  const scenarioId = String((params as any)?.scenarioId ?? "").trim();

  const { userId, token } = useAuth();
  const app = useAppData() as any;
  const db = app?.db as any;

  const isBackendMode = useMemo(() => {
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    const t = String(token ?? "").trim();
    return Boolean(baseUrl && t);
  }, [token]);

  const cached = useMemo(() => {
    try {
      return (db as any)?.scenarioNotificationPrefsByScenarioId?.[scenarioId] ?? null;
    } catch {
      return null;
    }
  }, [db, scenarioId]);

  const [draft, setDraft] = useState<ScenarioNotificationPrefsDraft>(normalizePrefs(cached));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizePrefs(cached));
  }, [cached]);

  useEffect(() => {
    if (!scenarioId) return;
    if (!isBackendMode) return;
    void app?.getScenarioNotificationPrefs?.(scenarioId).catch(() => {});
  }, [app, isBackendMode, scenarioId]);

  const ownedProfiles = useMemo(() => {
    if (!db || !scenarioId || !userId) return [];
    const map = (db as any)?.profiles ?? {};
    const items = Object.values(map)
      .filter((p: any) => String(p?.scenarioId ?? "") === String(scenarioId))
      .filter((p: any) => String(p?.ownerUserId ?? "") === String(userId))
      .map((p: any) => ({
        id: String(p?.id ?? ""),
        displayName: String(p?.displayName ?? "") || String(p?.handle ?? "") || "(unnamed)",
        handle: String(p?.handle ?? ""),
      }))
      .filter((p: any) => p.id);

    items.sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));
    return items;
  }, [db, scenarioId, userId]);

  const toggleIgnored = (profileId: string) => {
    const pid = String(profileId ?? "").trim();
    if (!pid) return;
    setDraft((p) => {
      const set = new Set<string>((p.ignoredProfileIds ?? []).map(String));
      if (set.has(pid)) set.delete(pid);
      else set.add(pid);
      return { ...p, ignoredProfileIds: Array.from(set) };
    });
  };

  const muteAll = () => {
    Alert.alert("Mute all?", "This disables all notifications for this scenario.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mute all",
        style: "destructive",
        onPress: async () => {
          if (!isBackendMode) {
            Alert.alert("Not available", "Notification settings are only available in backend mode.");
            return;
          }
          if (!scenarioId) return;

          setSaving(true);
          try {
            await app?.updateScenarioNotificationPrefs?.(scenarioId, { muteAll: true });
            setDraft((p) => ({
              ...p,
              mentionsEnabled: false,
              repliesEnabled: false,
              messagesEnabled: false,
              groupMessagesEnabled: false,
              likesEnabled: false,
              repostsEnabled: false,
              quotesEnabled: false,
            }));
          } catch (e: any) {
            Alert.alert("Mute failed", formatErrorMessage(e, "Could not mute notifications"));
          }
          setSaving(false);
        },
      },
    ]);
  };

  const save = async () => {
    if (!scenarioId) return;
    if (!isBackendMode) {
      Alert.alert("Not available", "Notification settings are only available in backend mode.");
      return;
    }

    setSaving(true);
    try {
      await app?.updateScenarioNotificationPrefs?.(scenarioId, draft);
      router.back();
    } catch (e: any) {
      Alert.alert("Save failed", formatErrorMessage(e, "Could not save notification settings"));
    }
    setSaving(false);
  };

  const ToggleRow = ({
    label,
    value,
    onPress,
  }: {
    label: string;
    value: boolean;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress} hitSlop={8} style={styles.toggleRow}>
      <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{label}</ThemedText>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={22} color={value ? colors.tint : colors.textSecondary} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}> 
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.icon} />
          </Pressable>

          <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
            Notifications
          </ThemedText>

          <Pressable onPress={save} disabled={saving} hitSlop={10} style={({ pressed }) => [{ opacity: saving ? 0.5 : pressed ? 0.7 : 1 }]}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
              {saving ? "Saving…" : "Save"}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
          {!isBackendMode ? (
            <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
              <ThemedText style={{ color: colors.textSecondary, flex: 1 }}>
                Notification controls are available in backend mode.
              </ThemedText>
            </View>
          ) : null}

          <RowCard label="Quick actions" colors={colors}>
            <Pressable onPress={muteAll} disabled={saving} style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? colors.pressed : colors.background, borderColor: colors.border, opacity: saving ? 0.6 : 1 }]}>
              <Ionicons name="notifications-off-outline" size={18} color="#ff3b30" />
              <ThemedText style={{ color: "#ff3b30", fontWeight: "800" }}>Mute all notifications</ThemedText>
            </Pressable>
          </RowCard>

          <RowCard label="Scenario notifications" colors={colors}>
            <ToggleRow label="Mentions" value={draft.mentionsEnabled} onPress={() => setDraft((p) => ({ ...p, mentionsEnabled: !p.mentionsEnabled }))} />
            <ToggleRow label="Replies" value={draft.repliesEnabled} onPress={() => setDraft((p) => ({ ...p, repliesEnabled: !p.repliesEnabled }))} />
            <ToggleRow label="Messages" value={draft.messagesEnabled} onPress={() => setDraft((p) => ({ ...p, messagesEnabled: !p.messagesEnabled }))} />
            <ToggleRow label="Group chat messages" value={draft.groupMessagesEnabled} onPress={() => setDraft((p) => ({ ...p, groupMessagesEnabled: !p.groupMessagesEnabled }))} />
            <ToggleRow label="Likes" value={draft.likesEnabled} onPress={() => setDraft((p) => ({ ...p, likesEnabled: !p.likesEnabled }))} />
            <ToggleRow label="Reposts" value={draft.repostsEnabled} onPress={() => setDraft((p) => ({ ...p, repostsEnabled: !p.repostsEnabled }))} />
            <ToggleRow label="Quotes" value={draft.quotesEnabled} onPress={() => setDraft((p) => ({ ...p, quotesEnabled: !p.quotesEnabled }))} />
          </RowCard>

          <RowCard label="Ignore owned characters" colors={colors}>
            {ownedProfiles.length === 0 ? (
              <ThemedText style={{ color: colors.textSecondary }}>
                No owned characters found in this scenario.
              </ThemedText>
            ) : (
              ownedProfiles.map((p: any) => {
                const ignored = draft.ignoredProfileIds.includes(String(p.id));
                const subtitle = p.handle ? `@${p.handle}` : "";
                return (
                  <Pressable key={p.id} onPress={() => toggleIgnored(p.id)} hitSlop={8} style={styles.ignoreRow}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ color: colors.text, fontWeight: "700" }}>{p.displayName}</ThemedText>
                      {subtitle ? <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>{subtitle}</ThemedText> : null}
                    </View>
                    <Ionicons name={ignored ? "checkbox" : "square-outline"} size={22} color={ignored ? colors.tint : colors.textSecondary} />
                  </Pressable>
                );
              })
            )}
          </RowCard>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  container: {
    padding: 14,
    gap: 12,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
  },
  toggleRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  ignoreRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
});
