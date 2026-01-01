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

import { createScenarioIO } from "@/lib/scenarioIO";

const MAX_PLAYERS = 20;

type ScenarioMenuState = {
  open: boolean;
  scenarioId: string | null;
  inviteCode: string | null;
  scenarioName: string | null;
};

type TransferSheetState = {
  open: boolean;
  scenarioId: string | null;
};

export default function ScenarioListScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const { signOut, userId } = useAuth();
  const {
    isReady,
    listScenarios,
    db,
    transferScenarioOwnership,
    leaveScenario: leaveScenarioApi,
    deleteScenario: deleteScenarioApi,

    //import/export APIs
    previewImportScenarioFromFile,
    importScenarioFromFile,
    exportScenarioToFile,
  } = useAppData() as any;

  const io = useMemo(
  () =>
    createScenarioIO({
      isReady,
      userId,
      db,
      previewImportScenarioFromFile,
      importScenarioFromFile,
      exportScenarioToFile,
      onImportedNavigate: (scenarioId) => {
        router.replace({
          pathname: "/(scenario)/[scenarioId]",
          params: { scenarioId },
        } as any);
      },
    }),
  [isReady, userId, db, previewImportScenarioFromFile, importScenarioFromFile, exportScenarioToFile]
);

  const [menu, setMenu] = useState<ScenarioMenuState>({
    open: false,
    scenarioId: null,
    inviteCode: null,
    scenarioName: null,
  });

  const [transfer, setTransfer] = useState<TransferSheetState>({
    open: false,
    scenarioId: null,
  });

  // optional: confirmation step (so you don’t “accidentally” transfer)
  const [confirm, setConfirm] = useState<{
    open: boolean;
    scenarioId: string | null;
    toUserId: string | null;
  }>({ open: false, scenarioId: null, toUserId: null });

  const closeTransfer = () => setTransfer({ open: false, scenarioId: null });
  const closeConfirm = () => setConfirm({ open: false, scenarioId: null, toUserId: null });

  const onLogout = async () => {
    await signOut();
    router.replace("/(auth)/login");
  };

  const openSettings = () => {
    router.push("/(scenario)/settings" as any);
  };

  const openScenarioEdit = (scenarioId: string) => {
    router.push({ pathname: "/modal/create-scenario", params: { scenarioId } } as any);
  };

  const openCreateScenario = () => {
    router.push("/modal/create-scenario" as any);
  };

  const openJoinScenario = () => {
    router.push("/modal/join-scenario" as any);
  };

  const scenarios = useMemo(() => {
    if (!isReady) return [];
    const all = listScenarios?.() ?? [];
    const uid = String(userId ?? "").trim();

    if (!uid) {
      return all.sort((a: any, b: any) => {
        const aTime = new Date(a.createdAt ?? 0).getTime();
        const bTime = new Date(b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
    }

    return all
      .filter((s: any) => (s?.playerIds ?? []).map(String).includes(uid))
      .sort((a: any, b: any) => {
        const aTime = new Date(a.createdAt ?? 0).getTime();
        const bTime = new Date(b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
  }, [isReady, listScenarios, userId]);

  const openScenario = (scenarioId: string) => {
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    // if you already have a selected profile for this scenario => go in
    const selected = (db as any)?.selectedProfileByScenario?.[sid];
    if (selected) {
      router.push(`/(scenario)/${sid}` as any);
      return;
    }

    // otherwise check if you own ANY profile in this scenario
    const uid = String(userId ?? "").trim();
    const profilesMap = (db as any)?.profiles ?? {};
    const hasAnyProfileInScenario = Object.values(profilesMap).some((p: any) => {
      return String(p?.scenarioId) === sid && String(p?.ownerUserId) === uid;
    });

    if (hasAnyProfileInScenario) {
      // you have profiles but none selected -> go pick one
      router.push({
        pathname: "/modal/select-profile",
        params: {
          scenarioId: sid,
          returnTo: encodeURIComponent(`/(scenario)/${sid}`),
          replace: "1",
        },
      } as any);
      return;
    }

    // no profile at all -> force create
    router.push({
      pathname: "/modal/create-profile",
      params: {
        scenarioId: sid,
        mode: "create",
        forced: "1", // to hide cancel/back in the modal
      },
    } as any);
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
    if (!isReady) return;

    const sid = String(menu.scenarioId ?? "").trim();
    if (!sid) return;

    const scenario = (db as any)?.scenarios?.[sid];
    if (!scenario) return;

    const uid = String(userId ?? "").trim();
    if (!uid) return;

    const ownerId = String((scenario as any)?.ownerUserId ?? "");
    const players: string[] = Array.isArray(scenario.playerIds) ? scenario.playerIds.map(String) : [];

    const isOwner = uid === ownerId;
    const otherPlayersCount = players.filter((p) => p !== uid).length;

    // owner + others => must transfer ownership first
    if (isOwner && otherPlayersCount > 0) {
      Alert.alert("You’re the owner", "Transfer ownership before leaving this scenario.");
      return;
    }

    // owner alone => leave silently (no alert) per your rule
    if (isOwner && otherPlayersCount === 0) {
      closeScenarioMenu();
      Promise.resolve(leaveScenarioApi?.(sid, uid)).catch(() => {});
      return;
    }

    const name = menu.scenarioName ?? "this scenario";
    Alert.alert("Leave scenario?", `Are you sure you want to leave ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          closeScenarioMenu();
          try {
            await leaveScenarioApi?.(sid, uid);
          } catch (e: any) {
            Alert.alert("Leave failed", e?.message ?? "Could not leave scenario.");
          }
        },
      },
    ]);
  };

  const transferOwnership = () => {
    if (!isReady) return;

    const sid = String(menu.scenarioId ?? "").trim();
    if (!sid) return;

    const scenario = (db as any)?.scenarios?.[sid];
    if (!scenario) return;

    const ownerId = String((scenario as any)?.ownerUserId ?? "");
    if (!userId || String(userId) !== ownerId) {
      Alert.alert("Not allowed", "Only the owner can transfer ownership.");
      return;
    }

    closeScenarioMenu();
    setTransfer({ open: true, scenarioId: sid });
  };

  const deleteScenario = () => {
    if (!isReady) return;

    const sid = String(menu.scenarioId ?? "").trim();
    if (!sid) return;

    const scenario = (db as any)?.scenarios?.[sid];
    if (!scenario) return;

    const uid = String(userId ?? "").trim();
    if (!uid) return;

    const ownerId = String((scenario as any)?.ownerUserId ?? "");
    if (uid !== ownerId) {
      Alert.alert("Not allowed", "Only the owner can delete this scenario.");
      return;
    }

    const name = menu.scenarioName ?? "this scenario";
    Alert.alert(
      "Delete scenario?",
      `This will permanently delete ${name} for everyone. This cannot be recovered.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            closeScenarioMenu();
            try {
              const ok = await deleteScenarioApi?.(sid, uid);
              if (!ok) Alert.alert("Delete failed", "Could not delete this scenario.");
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Could not delete this scenario.");
            }
          },
        },
      ]
    );
  };


  const openExportChoice = () => {
    const sid = String(menu.scenarioId ?? "").trim();
    if (!sid) return;

    io.openExportChoice(sid, {
      onBeforeOpen: () => closeScenarioMenu(),
    });
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

          {/* Export */}
          <Pressable
            onPress={openExportChoice}
            style={({ pressed }) => [
              styles.menuItem,
              { backgroundColor: pressed ? colors.pressed : "transparent" },
            ]}
          >
            <Ionicons name="download-outline" size={18} color={colors.text} />
            <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              Export
            </ThemedText>
          </Pressable>
          
          {/* Transfer ownership (owner-only) */}
          {!!userId &&
          !!menu.scenarioId &&
          String((db as any)?.scenarios?.[String(menu.scenarioId)]?.ownerUserId ?? "") === String(userId) ? (
            <>
              <Pressable
                onPress={transferOwnership}
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color="#ff3b30" />
                <ThemedText style={{ color: "#ff3b30", fontSize: 15, fontWeight: "700" }}>
                  Transfer ownership
                </ThemedText>
              </Pressable>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            </>
          ) : null}

          {/* Leave scenario */}
          <Pressable
            onPress={leaveScenario}
            style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
          >
            <Ionicons name="exit-outline" size={18} color="#ff3b30" />
            <ThemedText style={{ color: "#ff3b30", fontSize: 15, fontWeight: "700" }}>
              Leave Scenario
            </ThemedText>
          </Pressable>

          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

          {/* Delete scenario (owner-only) */}
          {!!userId &&
          !!menu.scenarioId &&
          String((db as any)?.scenarios?.[String(menu.scenarioId)]?.ownerUserId ?? "") === String(userId) ? (
            <Pressable
              onPress={deleteScenario}
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
            >
              <Ionicons name="trash-outline" size={18} color="#ff3b30" />
              <ThemedText style={{ color: "#ff3b30", fontSize: 15, fontWeight: "700" }}>
                Delete Scenario
              </ThemedText>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const TransferOwnershipSheet = () => {
    if (!transfer.open) return null;

    const sid = String(transfer.scenarioId ?? "");
    const scenario = sid ? (db as any)?.scenarios?.[sid] : null;

    const ownerId = String((scenario as any)?.ownerUserId ?? "");
    const players: string[] = Array.isArray(scenario?.playerIds) ? scenario.playerIds.map(String) : [];

    const usersMap = (db as any)?.users ?? {};
    const candidates = players
      .filter((pid) => pid && pid !== ownerId)
      .map((pid) => usersMap[pid] ?? { id: pid, username: pid, avatarUrl: "" });

    return (
      <Modal transparent visible={transfer.open} animationType="fade" onRequestClose={closeTransfer}>
        <Pressable style={styles.menuBackdrop} onPress={closeTransfer}>
          <Pressable
            style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Transfer ownership</ThemedText>
              <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16, marginTop: 4 }}>
                Choose the new owner
              </ThemedText>
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <View style={{ maxHeight: 340 }}>
              <FlatList
                data={candidates}
                keyExtractor={(u: any) => String(u.id)}
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
                renderItem={({ item }: any) => {
                  const label = item?.username ? `@${String(item.username)}` : String(item.id);

                  return (
                    <Pressable
                      onPress={() => setConfirm({ open: true, scenarioId: sid, toUserId: String(item.id) })}
                      style={({ pressed }) => [
                        styles.transferRow,
                        { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                      ]}
                    >
                      <Image
                        source={{ uri: String(item.avatarUrl ?? "") }}
                        style={[styles.transferAvatar, { borderColor: colors.border }]}
                      />

                      <View style={{ flex: 1, gap: 2 }}>
                        <ThemedText style={{ color: colors.text, fontWeight: "800", fontSize: 14 }} numberOfLines={1}>
                          {label}
                        </ThemedText>
                      </View>

                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </Pressable>
                  );
                }}
              />
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <Pressable
              onPress={closeTransfer}
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
            >
              <Ionicons name="close-outline" size={18} color={colors.text} />
              <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cancel</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const TransferConfirmSheet = () => {
    if (!confirm.open) return null;

    const sid = String(confirm.scenarioId ?? "");
    const toId = String(confirm.toUserId ?? "");
    const usersMap = (db as any)?.users ?? {};
    const target = usersMap[toId];

    const label = target?.username ? `@${String(target.username)}` : toId;

    const onConfirm = async () => {
      if (!sid || !toId || !userId) return;

      try {
        const updated = await transferScenarioOwnership(sid, String(userId), toId);
        closeConfirm();
        closeTransfer();

        if (!updated) {
          Alert.alert("Transfer failed", "Could not transfer ownership.");
          return;
        }

        Alert.alert("Done", "Ownership transferred.");
      } catch (e: any) {
        Alert.alert("Transfer failed", e?.message ?? "Could not transfer ownership.");
      }
    };

    return (
      <Modal transparent visible={confirm.open} animationType="fade" onRequestClose={closeConfirm}>
        <Pressable style={styles.menuBackdrop} onPress={closeConfirm}>
          <Pressable
            style={[styles.confirmCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
              Confirm transfer
            </ThemedText>

            <ThemedText style={{ color: colors.textSecondary, marginTop: 8 }}>
              Transfer ownership to <ThemedText style={{ color: colors.text, fontWeight: "800" }}>{label}</ThemedText>?
            </ThemedText>

            {target?.avatarUrl ? (
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <Image
                  source={{ uri: String(target.avatarUrl) }}
                  style={[styles.confirmAvatar, { borderColor: colors.border }]}
                />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={closeConfirm}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.card },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "800" }}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { borderColor: "#ff3b30", backgroundColor: pressed ? "rgba(255,59,48,0.12)" : "transparent" },
                ]}
              >
                <ThemedText style={{ color: "#ff3b30", fontWeight: "900" }}>Transfer</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

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
            {/* Import */}
            <Pressable
              onPress={io.runImportFlow}
              hitSlop={10}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Import scenario"
            >
              <Ionicons name="cloud-upload-outline" size={22} color={colors.icon} />
            </Pressable>

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

            const mode = (item as any)?.mode === "campaign" ? "campaign" : "story";
            const modeLabel = mode === "campaign" ? "CAMPAIGN" : "STORY";

            const modeBorderColor = mode === "campaign" ? colors.tint : colors.border;
            const modeBgColor = mode === "campaign" ? colors.pressed : "transparent";
            const modeTextColor = mode === "campaign" ? colors.tint : colors.textSecondary;

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
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {item.name}
                      </ThemedText>

                      <View style={[styles.modePill, { borderColor: modeBorderColor, backgroundColor: modeBgColor }]}>
                        <ThemedText style={[styles.modePillText, { color: modeTextColor }]}>{modeLabel}</ThemedText>
                      </View>
                    </View>

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
      <TransferOwnershipSheet />
      <TransferConfirmSheet />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  headerIconBtn: { padding: 6, backgroundColor: "transparent" },

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
  topBarActions: { gap: 6 },
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

  transferRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  transferAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(127,127,127,0.15)",
  },

  confirmCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    justifyContent: "center",
    marginBottom: 18,
  },
  confirmAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(127,127,127,0.15)",
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "center",
  },
  modePillText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});