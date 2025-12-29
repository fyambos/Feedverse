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

  const { signOut } = useAuth();
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
    await Clipboard.setStringAsync(menu.inviteCode);
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
        <Pressable style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Pressable
            onPress={copyInviteCode}
            style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
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
        <FlatList
          data={scenarios}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const usersMap = (db as any)?.users ?? {};
            const players = (item.playerIds ?? [])
              .map((id: string) => usersMap[String(id)] ?? null)
              .filter(Boolean);

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
  subtitle: { marginTop: 4, marginBottom: 16 },
  headerIconBtn: { padding: 6, backgroundColor: "transparent" },
  list: { paddingVertical: 8, gap: 12 },

  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cover: { width: "100%", height: 120 },

  cardContent: { padding: 12, gap: 8 },

  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },

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