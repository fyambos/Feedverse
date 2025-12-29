// mobile/app/index.tsx
import React, { useMemo, useState } from "react";
import { StyleSheet, FlatList, Pressable, Image, View, Modal, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { TagPill } from "@/components/ui/TagPill";

const MAX_PLAYERS = 20;

type ScenarioMenuState = {
  open: boolean;
  scenarioId: string | null;
  inviteCode: string | null;
  scenarioName: string | null;
};

export default function ScenarioListScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const { signOut, userId } = useAuth();
  const { isReady, listScenarios, db } = useAppData();

  const [menu, setMenu] = useState<ScenarioMenuState>({
    open: false,
    scenarioId: null,
    inviteCode: null,
    scenarioName: null,
  });

  const onLogout = async () => {
    await signOut();
    router.replace("/(auth)/login");
  };

  const openSettings = () => {
    router.push("/(scenario)/settings" as any);
  };

  const openScenarioEdit = (scenarioId: string) => {
    router.push({ pathname: "/modal/create-scenario", params: { scenarioId: scenarioId } } as any);
  };

  const openCreateScenario = () => {
    router.push("/modal/create-scenario" as any);
  };

  const openJoinScenario = () => {
    // adjust route if needed
    router.push("/modal/join-scenario" as any);
  };

  const scenarios = useMemo(() => (isReady ? listScenarios() : []), [isReady, listScenarios]);

  const openScenario = (scenarioId: string) => {
    router.push(`/(scenario)/${scenarioId}` as any);
  };

  const openScenarioMenu = (scenario: any) => {
    setMenu({
      open: true,
      scenarioId: String(scenario.id),
      inviteCode: scenario.inviteCode ? String(scenario.inviteCode) : null,
      scenarioName: scenario.name ? String(scenario.name) : "Scenario",
    });
  };

  const closeScenarioMenu = () => {
    setMenu({ open: false, scenarioId: null, inviteCode: null, scenarioName: null });
  };

  const copyInviteCode = async () => {
    if (!menu.inviteCode) {
      Alert.alert("No invite code", "This scenario has no invite code.");
      return;
    }
    await Clipboard.setStringAsync(menu.inviteCode); // raw
    closeScenarioMenu();
    Alert.alert("Copied", "Invite code copied to clipboard.");
  };

  const leaveScenario = () => {
    const name = menu.scenarioName ?? "this scenario";
    Alert.alert("Leave scenario?", `Are you sure you want to leave ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          closeScenarioMenu();
          Alert.alert("Leaving", "Hook this up to your leaveScenario() logic.");
        },
      },
    ]);
  };

  const ScenarioMenuSheet = () => (
    <Modal transparent visible={menu.open} animationType="fade" onRequestClose={closeScenarioMenu}>
      <Pressable style={styles.menuBackdrop} onPress={closeScenarioMenu}>
        <Pressable
          style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={(e) => e?.stopPropagation?.()}
        >
          <View style={styles.menuInviteWrap}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Invite code</ThemedText>
            <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16, marginTop: 4 }}>
              {menu.inviteCode ?? "None"}
            </ThemedText>
          </View>

          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={copyInviteCode}
            disabled={!menu.inviteCode}
            style={({ pressed }) => [
              styles.menuItem,
              {
                backgroundColor: pressed ? colors.pressed : "transparent",
                opacity: menu.inviteCode ? 1 : 0.55,
              },
            ]}
          >
            <Ionicons name="copy-outline" size={18} color={colors.text} />
            <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
              Copy Invite Code
            </ThemedText>
          </Pressable>

          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={leaveScenario}
            style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
          >
            <Ionicons name="exit-outline" size={18} color="#ff3b30" />
            <ThemedText style={{ color: "#ff3b30", fontSize: 15, fontWeight: "700" }}>
              Leave Scenario
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.topBarRow}>
          <View style={styles.topBarSide} />

          <ThemedText type="defaultSemiBold" style={styles.topBarTitle}>
            Scenarios
          </ThemedText>

          <View style={[styles.topBarSide, styles.topBarActions]}>
            <Pressable
              onPress={openSettings}
              hitSlop={10}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={22} color={colors.icon} />
            </Pressable>

            <Pressable
              onPress={onLogout}
              hitSlop={10}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={22} color={colors.icon} />
            </Pressable>
          </View>
        </View>
      </View>

      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.ctaRow}>
          <Pressable
            onPress={openCreateScenario}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.pressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create scenario"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.icon} />
            <ThemedText type="defaultSemiBold" style={{ fontSize: 14 }}>
              Create
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={openJoinScenario}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.pressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Join scenario"
          >
            <Ionicons name="enter-outline" size={18} color={colors.icon} />
            <ThemedText type="defaultSemiBold" style={{ fontSize: 14 }}>
              Join
            </ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={scenarios}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const usersMap = (db as any)?.users ?? {};
            const players = (item.playerIds ?? [])
              .map((id: string) => usersMap[String(id)] ?? null)
              .filter(Boolean);

            const inviteCode = item.inviteCode ? String(item.inviteCode) : null;
            const tags = Array.isArray((item as any).tags) ? (item as any).tags : [];
            const isOwner = !!userId && String((item as any).ownerUserId) === String(userId);

            return (
              <Pressable
                onPress={() => openScenario(String(item.id))}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <Image source={{ uri: item.cover }} style={styles.cover} resizeMode="cover" />

                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ flex: 1 }}>
                      {item.name}
                    </ThemedText>

                    {isOwner ? (
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          openScenarioEdit(String(item.id));
                        }}
                        hitSlop={10}
                        style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                        accessibilityRole="button"
                        accessibilityLabel="Edit scenario"
                      >
                        <Ionicons name="create-outline" size={18} color={colors.icon} />
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openScenarioMenu(item);
                      }}
                      hitSlop={10}
                      style={({ pressed }) => [styles.dotsBtn, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Scenario options"
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.icon} />
                    </Pressable>
                  </View>

                  <View style={styles.playersRow}>
                    <View style={styles.avatars}>
                      {players.slice(0, 4).map((player: any, index: number) => (
                        <Image
                          key={String(player!.id)}
                          source={{ uri: player!.avatarUrl }}
                          style={[
                            styles.avatar,
                            {
                              marginLeft: index === 0 ? 0 : -8,
                              borderColor: colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>

                    <ThemedText style={[styles.playerCount, { color: colors.textMuted }]}>
                      {players.length}/{MAX_PLAYERS} Players
                    </ThemedText>
                  </View>

                  {inviteCode ? (
                    <Pressable
                      onPress={async () => {
                        await Clipboard.setStringAsync(inviteCode);
                        Alert.alert("Copied", "Invite code copied to clipboard.");
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
                    >
                      <ThemedText style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                        Invite: {inviteCode}
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  {tags.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {tags.slice(0, 4).map((t: any) => (
                        <TagPill
                          key={String(t.id ?? t.key ?? t.name)}
                          label={String(t.name ?? t.key)}
                          color={typeof t.color === "string" ? t.color : undefined}
                          colors={colors as any}
                        />
                      ))}
                      {tags.length > 4 ? <TagPill label={`+${tags.length - 4}`} colors={colors as any} /> : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={() => (
            <View style={{ paddingVertical: 24 }}>
              <ThemedText style={{ color: colors.textSecondary }}>
                {isReady ? "No scenarios yet." : "Loading…"}
              </ThemedText>
            </View>
          )}
        />
      </ThemedView>

      <ScenarioMenuSheet />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  headerIconBtn: { padding: 6, backgroundColor: "transparent" },

  // ✅ CTA row
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  ctaBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  list: { paddingVertical: 8, gap: 12 },

  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cover: { width: "100%", height: 120 },

  cardContent: { padding: 12, gap: 8 },

  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  iconBtn: { padding: 6, borderRadius: 999, alignSelf: "flex-start" },
  dotsBtn: { padding: 6, borderRadius: 999, alignSelf: "flex-start" },

  playersRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatars: { flexDirection: "row", alignItems: "center" },

  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  playerCount: { fontSize: 12 },

  topBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  topBarRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarSide: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  topBarActions: { gap: 14 },
  topBarTitle: { fontSize: 18 },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  menuSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  menuInviteWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginVertical: 6,
    marginHorizontal: 8,
  },
});