// mobile/app/modal/select-profile.tsx
import React from "react";
import { FlatList, Image, Pressable, StyleSheet, View, Modal } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";
import { Alert } from "@/context/dialog";

import type { Profile } from "@/data/db/schema";
import { canEditProfile } from "@/lib/permission";
import { formatErrorMessage } from "@/lib/format";

import {
  MAX_OWNED_PROFILES_PER_USER,
  MAX_TOTAL_PROFILES_PER_SCENARIO,
  canCreateOwnedProfileForUser,
  countOwnedProfilesForUser,
} from "@/lib/rules";

type TabKey = "mine" | "public";
type ViewMode = "tabs" | "all"; // tabs = Mine/Public, all = single list (no tabs)

type ProfileLimitMode = "per_owner" | "per_scenario";

export default function SelectProfileModal() {
  const { scenarioId, afterCreate, returnTo, replace } = useLocalSearchParams<{
    scenarioId: string;
    afterCreate?: string;
    returnTo?: string;
    replace?: string; // "1" => use router.replace
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const { userId } = useAuth();

  const {
    isReady,
    listProfilesForScenario,
    getSelectedProfileId,
    setSelectedProfileId,
    db,
    getScenarioById,
    transferProfilesToUser,
    adoptPublicProfile,
  } = useAppData() as any;

  const usersMap = (db as any)?.users ?? {};


  const looksLikeUuid = (v?: string | null) => {
    if (!v) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
  };
  const [tab, setTab] = React.useState<TabKey>("mine");
  const [mode, setMode] = React.useState<ViewMode>("tabs");

  // state for multi select
  const [multi, setMulti] = React.useState<boolean>(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // state for transfer ownership (profiles)
  const [transfer, setTransfer] = React.useState<{ open: boolean }>(() => ({ open: false }));
  const [confirmTransfer, setConfirmTransfer] = React.useState<{
    open: boolean;
    toUserId: string | null;
  }>(() => ({ open: false, toUserId: null }));

  // state for adopting a shared profile
  const [adopt, setAdopt] = React.useState<{ open: boolean; profileId: string | null }>(() => ({
    open: false,
    profileId: null,
  }));

  const adoptConfirmRef = React.useRef(false);
  const [adoptBusy, setAdoptBusy] = React.useState(false);

  const transferConfirmRef = React.useRef(false);
  const [transferBusy, setTransferBusy] = React.useState(false);

  const closeAdopt = () => {
    adoptConfirmRef.current = false;
    setAdoptBusy(false);
    setAdopt({ open: false, profileId: null });
  };

  const closeTransfer = () => setTransfer({ open: false });
  const closeConfirmTransfer = () => {
    transferConfirmRef.current = false;
    setTransferBusy(false);
    setConfirmTransfer({ open: false, toUserId: null });
  };

  const scenario = React.useMemo(() => {
    if (!isReady) return null;
    return getScenarioById?.(sid) ?? null;
  }, [isReady, getScenarioById, sid]);

  const transferCandidates = React.useMemo(() => {
    const players: string[] = Array.isArray((scenario as any)?.playerIds)
      ? (scenario as any).playerIds.map(String)
      : [];

    const uid = String(userId ?? "");

        return players
      .filter((pid) => pid && pid !== uid)
      .map((pid) => {
        const uid2 = String(pid);
        const user = usersMap[uid2];
        if (user) return { ...user, avatarUrl: user.avatarUrl ?? undefined } as any;
        try {
          const profiles = (db as any)?.profiles ?? {};
          for (const p of Object.values(profiles)) {
            if (String((p as any).ownerUserId ?? "") !== uid2) continue;
            if (String((p as any).scenarioId ?? "") !== sid) continue;
            return {
              id: uid2,
              username: undefined,
              avatarUrl: String((p as any).avatarUrl ?? "") || undefined,
            } as any;
          }
        } catch {
          // ignore
        }

        return { id: uid2, username: undefined, avatarUrl: undefined } as any;
      });
  }, [scenario, usersMap, userId]);

  const profileLimitMode: ProfileLimitMode = React.useMemo(() => {
    const m = (scenario as any)?.settings?.profileLimitMode;
    return m === "per_scenario" ? "per_scenario" : "per_owner";
  }, [scenario]);

const allProfiles = React.useMemo<Profile[]>(() => {
  if (!isReady) return [];
  return listProfilesForScenario(sid) as Profile[];
}, [isReady, sid, listProfilesForScenario]);

  const mine = React.useMemo(
    () => allProfiles.filter((p) => String(p.ownerUserId) === String(userId)),
    [allProfiles, userId]
  );

  const publicProfiles = React.useMemo(
    () => allProfiles.filter((p) => !!p.isPublic && String(p.ownerUserId) !== String(userId)),
    [allProfiles, userId]
  );

  const data = mode === "all" ? allProfiles : tab === "mine" ? mine : publicProfiles;

  const current = getSelectedProfileId(sid);

  const ownedCount = React.useMemo(() => {
    return countOwnedProfilesForUser(allProfiles, userId ?? null);
  }, [allProfiles, userId]);

  const totalScenarioCount = React.useMemo(() => allProfiles.length, [allProfiles]);

  React.useEffect(() => {
    // reset tab when switching to tabs mode
    if (!(mode === "tabs" && tab === "mine")) {
      setMulti(false);
      setSelectedIds(new Set());
    }
  }, [mode, tab]);

  // creation rule depends on scenario setting
  const canCreate = React.useMemo(() => {
    if (profileLimitMode === "per_scenario") {
      return totalScenarioCount < MAX_TOTAL_PROFILES_PER_SCENARIO;
    }
    return canCreateOwnedProfileForUser(allProfiles, userId ?? null);
  }, [profileLimitMode, totalScenarioCount, allProfiles, userId]);

  // ---- HELPERS ----
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllMineSelected = React.useMemo(() => {
    if (!multi) return false;
    if (mine.length === 0) return false;
    const mineIds = mine.map((p) => String(p.id));
    return mineIds.every((id) => selectedIds.has(id));
  }, [mine, selectedIds, multi]);

  const toggleSelectAllMine = () => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).map(String));
      const mineIds = mine.map((p) => String(p.id));
      const allSelected = mineIds.length > 0 && mineIds.every((id) => next.has(id));

      if (allSelected) {
        for (const id of mineIds) next.delete(id);
      } else {
        for (const id of mineIds) next.add(id);
      }

      return next;
    });
  };

  const finishSelection = React.useCallback(
    async (profileId: string) => {
      await setSelectedProfileId(sid, String(profileId));

      if (returnTo) {
        const dest = decodeURIComponent(String(returnTo));
        if (String(replace ?? "") === "1") router.replace(dest as any);
        else router.push(dest as any);
        return;
      }

      if (String(afterCreate ?? "") === "1") {
        router.replace({
          pathname: "/(scenario)/[scenarioId]/(tabs)/home",
          params: { scenarioId: sid },
        } as any);
        return;
      }

      router.back();
    },
    [afterCreate, replace, returnTo, setSelectedProfileId, sid]
  );

  // ---- RENDERING ----

  const Row = ({ item }: { item: Profile }) => {
    const isAllMode = mode === "all";
    const selectEnabled = !isAllMode;
    const active = String(item.id) === String(current);

    const id = String(item.id);
    const isMineTab = mode === "tabs" && tab === "mine";
    const showCheckbox = multi && isMineTab && selectEnabled;
    const checked = selectedIds.has(id);

    const isSharedFromOther = !!item.isPublic && String(item.ownerUserId) !== String(userId);
    const ownerId = String(item.ownerUserId ?? "");
    const owner = ownerId ? (usersMap[ownerId] ?? null) : null;

    const canEditThis = canEditProfile({
      profile: item,
      userId: userId ?? null,
      selectedProfileId: current ?? null,
    });

    return (
      <Pressable
        onPress={async () => {
          if (isAllMode) {
            // In "All profiles" mode, rows act as links to the profile page.
            const profileId = String(item.id);
            if (!sid || !profileId) return;

            // Close this modal first, then navigate.
            try {
              if (router.canGoBack?.()) router.back();
            } catch {
              // ignore
            }

            setTimeout(() => {
              try {
                router.push({
                  pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
                  params: { scenarioId: sid, profileId },
                } as any);
              } catch {
                // ignore
              }
            }, 60);

            return;
          }

          if (!selectEnabled) return;
          if (showCheckbox) {
            toggleOne(id);
            return;
          }

          // shared profile from someone else
          if (isSharedFromOther) {
            // If the owner is still in the scenario, just select the profile (no adopt)
            const ownerId = String(item.ownerUserId ?? "");
            const scenarioPlayerIds = Array.isArray((scenario as any)?.playerIds)
              ? (scenario as any).playerIds.map(String)
              : [];
            if (ownerId && scenarioPlayerIds.includes(ownerId)) {
              await finishSelection(String(item.id));
              return;
            }
            // Otherwise, allow adoption
            setAdopt({ open: true, profileId: id });
            return;
          }

          await finishSelection(String(item.id));
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? colors.pressed : colors.background,
          },
        ]}
      >
        <View style={styles.left}>
          {showCheckbox ? (
            <Pressable
              onPress={() => toggleOne(id)}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1}]}
            >
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={22}
                color={checked ? colors.tint : colors.textSecondary}
              />
            </Pressable>
          ) : null}
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatar, { backgroundColor: colors.border }]} />
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.displayName}
              </ThemedText>

              {canEditThis ? (
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    router.push({
                      pathname: "/modal/create-profile",
                      params: { scenarioId: sid, mode: "edit", profileId: String(item.id) },
                    } as any);
                  }}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.editIconBtn,
                    { backgroundColor: pressed ? colors.pressed : "transparent" },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.handleRow}>
              <ThemedText numberOfLines={1} style={{ color: colors.textSecondary }}>
                @{item.handle}
              </ThemedText>

              {item.isPublic ? (
                <ThemedText style={[styles.publicBadge, { color: colors.textSecondary }]}>
                  {" "}
                  • Shared
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.right}>
          {owner ? (
            <>
              {owner.avatarUrl ? (
                <Image source={{ uri: owner.avatarUrl ?? undefined }} style={styles.ownerAvatar} />
              ) : (
                <View style={[styles.ownerAvatar, { backgroundColor: colors.border }]} />
              )}
                <ThemedText numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary }}>
                  {(() => {
                    const uname = owner.username ?? "";
                    if (!uname || looksLikeUuid(uname)) {
                      return item.displayName ? String(item.displayName) : "Unknown";
                    }
                    return uname;
                  })()}
                </ThemedText>
            </>
          ) : null}
          {selectEnabled && active ? (
            <ThemedText style={{ color: colors.tint, fontWeight: "800", marginLeft: 6 }}>✓</ThemedText>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const AdoptProfileConfirmSheet = () => {
    if (!adopt.open) return null;

    const pid = String(adopt.profileId ?? "");
    const profile = allProfiles.find((p) => String(p.id) === pid) ?? null;

    const onConfirm = async () => {
      if (!profile) return;
      const uid = String(userId ?? "");
      if (!uid) return;

      if (adoptConfirmRef.current) return;
      adoptConfirmRef.current = true;
      setAdoptBusy(true);

      try {
        const res = await adoptPublicProfile?.({ scenarioId: sid, profileId: pid, userId: uid });
        if (!res) {
          Alert.alert("Adopt failed", "Adopt API is unavailable.");
          return;
        }

        if (!res.ok) {
          Alert.alert("Adopt failed", res.error ?? "Could not adopt profile.");
          return;
        }

        closeAdopt();
        await finishSelection(pid);
      } catch (e: any) {
        Alert.alert("Adopt failed", formatErrorMessage(e, "Could not adopt profile."));
      } finally {
        adoptConfirmRef.current = false;
        setAdoptBusy(false);
      }
    };

    return (
      <Modal transparent visible={adopt.open} animationType="fade" onRequestClose={closeAdopt}>
        <Pressable style={styles.menuBackdrop} onPress={closeAdopt}>
          <Pressable
            style={[styles.confirmCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
              Adopt character?
            </ThemedText>

            <ThemedText style={{ color: colors.textSecondary, marginTop: 8 }}>
              This will make <ThemedText style={{ color: colors.text, fontWeight: "800" }}>{profile?.displayName}</ThemedText> yours.
            </ThemedText>

            {profile?.avatarUrl ? (
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <Image source={{ uri: String(profile.avatarUrl) }} style={[styles.confirmAvatar, { borderColor: colors.border }]} />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={closeAdopt}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : (colors as any).card },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "800" }}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                onPress={onConfirm}
                disabled={adoptBusy}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : "transparent",
                    opacity: adoptBusy ? 0.55 : 1,
                  },
                ]}
              >
                <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>
                  {adoptBusy ? "Adopting…" : "Adopt"}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const CreateProfileHeader = () => {
    if (!(mode === "tabs" && tab === "mine")) return null;

    const disabled = !canCreate;

    const subtitle =
      profileLimitMode === "per_scenario"
        ? disabled
          ? `Limit reached (${MAX_TOTAL_PROFILES_PER_SCENARIO} total profiles in this scenario).`
          : "Create a profile (scenario-wide limit)"
        : disabled
        ? `Limit reached (${MAX_OWNED_PROFILES_PER_USER} owned profiles).`
        : "Add a character for this scenario";

    return (
      <View>
        <Pressable
          disabled={disabled}
          onPress={() => {
            if (disabled) return;
            router.push({
              pathname: "/modal/create-profile",
              params: {
                scenarioId: sid,
                ...(returnTo ? { returnTo: String(returnTo) } : {}),
                ...(replace ? { replace: String(replace) } : {}),
              },
            } as any);
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed && !disabled ? colors.pressed : colors.background,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
        >
          <View style={[styles.profileAvatar, styles.createAvatar, { borderColor: colors.border }]}>
            <Ionicons name="add" size={22} color={colors.tint} />
          </View>

          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
              Create a new profile
            </ThemedText>

            <ThemedText style={{ color: colors.textSecondary }}>{subtitle}</ThemedText>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          {profileLimitMode === "per_scenario" ? (
            <>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                Scenario profiles: {totalScenarioCount}/{MAX_TOTAL_PROFILES_PER_SCENARIO}
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                You own: {ownedCount} (no per-player cap in this mode)
              </ThemedText>
            </>
          ) : (
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
              Owned profiles: {ownedCount}/{MAX_OWNED_PROFILES_PER_USER} (shared profiles don’t count)
            </ThemedText>
          )}
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </View>
    );
  };

  const SelectControlsHeader = () => {
    // only show in tabs/mine mode
    if (!(mode === "tabs" && tab === "mine")) return null;

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={() => setMulti((m) => !m)}
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText style={{ color: colors.tint, fontWeight: "600" }}>
            {multi ? "Cancel" : "Select"}
          </ThemedText>
        </Pressable>

        {multi ? (
          <Pressable
            onPress={toggleSelectAllMine}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText style={{ color: colors.tint, fontWeight: "600" }}>
              {isAllMineSelected ? "Unselect All" : "Select All"}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const TransferProfilesSheet = () => {
    if (!transfer.open) return null;

    if (transferCandidates.length === 0) {
      return (
        <Modal transparent visible={transfer.open} animationType="fade" onRequestClose={closeTransfer}>
          <Pressable style={styles.menuBackdrop} onPress={closeTransfer}>
            <Pressable
              style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={(e) => e?.stopPropagation?.()}
            >
              <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Transfer profiles</ThemedText>
                <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16, marginTop: 4 }}>
                  No other players found
                </ThemedText>
              </View>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

              <Pressable
                onPress={closeTransfer}
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.pressed : "transparent" }]}
              >
                <Ionicons name="close-outline" size={18} color={colors.text} />
                <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Close</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      );
    }

    return (
      <Modal transparent visible={transfer.open} animationType="fade" onRequestClose={closeTransfer}>
        <Pressable style={styles.menuBackdrop} onPress={closeTransfer}>
          <Pressable
            style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Transfer profiles</ThemedText>
              <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16, marginTop: 4 }}>
                Choose the new owner
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                Selected: {selectedIds.size}
              </ThemedText>
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <View style={{ maxHeight: 340 }}>
              <FlatList
                data={transferCandidates}
                keyExtractor={(u: any) => String(u.id)}
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
                renderItem={({ item }: any) => {
                  const uid3 = String(item?.id ?? "");
                  const userRow = (db as any)?.users?.[uid3];
                  const unameRow = userRow?.username ? String(userRow.username) : "";
                  const unameItem = item?.username ? String(item.username) : "";
                  const label = unameRow && !looksLikeUuid(unameRow)
                    ? `@${unameRow}`
                    : unameItem && !looksLikeUuid(unameItem)
                      ? `@${unameItem}`
                      : "Unknown";

                  return (
                    <Pressable
                      onPress={() => setConfirmTransfer({ open: true, toUserId: String(item.id) })}
                      style={({ pressed }) => [
                        styles.transferRow,
                        { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
                      ]}
                    >
                      {(
                        (db as any)?.users?.[String(item?.id ?? "")]?.avatarUrl || item?.avatarUrl
                      ) ? (
                        <Image
                          source={{ uri: String(((db as any)?.users?.[String(item?.id ?? "")]?.avatarUrl) ?? item?.avatarUrl ?? "") }}
                          style={[styles.transferAvatar, { borderColor: colors.border }]}
                        />
                      ) : (
                        <View style={[styles.transferAvatar, { borderColor: colors.border }]} />
                      )}

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

  const TransferProfilesConfirmSheet = () => {
    if (!confirmTransfer.open) return null;

    const toId = String(confirmTransfer.toUserId ?? "");
    const target = usersMap[toId];
    const label = target?.username ? `@${String(target.username)}` : "Unknown";

    const onConfirm = async () => {
      if (!toId) return;
      if (selectedIds.size === 0) {
        Alert.alert("Nothing selected", "Select at least one profile.");
        return;
      }

      if (transferConfirmRef.current) return;
      transferConfirmRef.current = true;
      setTransferBusy(true);

      try {
        const transferredIds = Array.from(selectedIds).map(String);

        const res = await transferProfilesToUser?.({
          scenarioId: sid,
          profileIds: transferredIds,
          toUserId: toId,
        });

        if (!res) {
          Alert.alert("Transfer failed", "Transfer API is unavailable.");
          return;
        }

        if (!res.ok) {
          Alert.alert("Transfer failed", res.error ?? "Could not transfer profiles.");
          return;
        }

        // Close sheets + reset UI FIRST so the modal backdrop can't "freeze" the screen
        // if anything below takes time.
        closeConfirmTransfer();
        closeTransfer();
        setSelectedIds(new Set());
        setMulti(false);

        // If the currently selected profile was transferred away,
        // fall back to the first remaining profile you still own.
        // Do this asynchronously (do not block UI / modal close).
        const fixSelectionAfterTransfer = async () => {
          try {
            const currentSelected = String(getSelectedProfileId(sid) ?? "");
            if (!currentSelected || !transferredIds.includes(currentSelected)) return;

            // Read from DB after transfer (more reliable than the `mine` memo which may be stale this tick)
            const profilesMap = (db as any)?.profiles ?? {};
            const remainingOwned = Object.values(profilesMap)
              .filter((p: any) => String(p?.scenarioId) === String(sid) && String(p?.ownerUserId) === String(userId))
              .map((p: any) => String(p?.id))
              .filter((id: string) => id && !transferredIds.includes(id));

            if (remainingOwned.length > 0) {
              await setSelectedProfileId(sid, remainingOwned[0]);
            } else {
              // No owned profiles left => clear selection (app should force pick/create later)
              await setSelectedProfileId(sid, null as any);
            }
          } catch {
            // no-op
          }
        };

        // run after this call stack so UI can settle
        setTimeout(() => {
          void fixSelectionAfterTransfer();
        }, 0);

        Alert.alert("Done", "Profiles transferred.");
      } catch (e: any) {
        Alert.alert("Transfer failed", formatErrorMessage(e, "Could not transfer profiles."));
      } finally {
        transferConfirmRef.current = false;
        setTransferBusy(false);
      }
    };

    return (
      <Modal transparent visible={confirmTransfer.open} animationType="fade" onRequestClose={closeConfirmTransfer}>
        <Pressable style={styles.menuBackdrop} onPress={closeConfirmTransfer}>
          <Pressable
            style={[styles.confirmCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
              Confirm transfer
            </ThemedText>

            <ThemedText style={{ color: colors.textSecondary, marginTop: 8 }}>
              Transfer {selectedIds.size} profile{selectedIds.size === 1 ? "" : "s"} to{" "}
              <ThemedText style={{ color: colors.text, fontWeight: "800" }}>{label}</ThemedText>?
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
                onPress={closeConfirmTransfer}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : (colors as any).card },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "800" }}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                onPress={onConfirm}
                disabled={transferBusy}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  {
                    borderColor: "#ff3b30",
                    backgroundColor: pressed ? "rgba(255,59,48,0.12)" : "transparent",
                    opacity: transferBusy ? 0.55 : 1,
                  },
                ]}
              >
                <ThemedText style={{ color: "#ff3b30", fontWeight: "900" }}>
                  {transferBusy ? "Transferring…" : "Transfer"}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
          {mode === "all" ? "All profiles" : "Choose profile"}
        </ThemedText>

        <Pressable
          onPress={() => setMode((m) => (m === "all" ? "tabs" : "all"))}
          hitSlop={12}
          style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={mode === "all" ? "Show tabs" : "Show all profiles"}
        >
          <Ionicons
            name={mode === "all" ? "albums-outline" : "people-outline"}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      {mode === "tabs" ? (
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          <TabButton label="Mine" active={tab === "mine"} onPress={() => setTab("mine")} colors={colors} />
          <TabButton label="Shared" active={tab === "public"} onPress={() => setTab("public")} colors={colors} />
        </View>
      ) : null}

      <FlatList
        data={data}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={() => (
          <>
            <CreateProfileHeader />
            <SelectControlsHeader />
          </>
        )}

        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        )}
        renderItem={({ item }) => <Row item={item as Profile} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 24 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              {mode === "all"
                ? "No profiles in this scenario."
                : tab === "mine"
                ? "You don’t own any profiles in this scenario."
                : "No public profiles available."}
            </ThemedText>
          </View>
        )}
      />

      <AdoptProfileConfirmSheet />
      {mode === "tabs" && tab === "mine" && multi ? (
        <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              Selected: {selectedIds.size}
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              Transfer changes profile owner
            </ThemedText>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              disabled={selectedIds.size === 0}
              onPress={() => {
                if (selectedIds.size === 0) return;
                setTransfer({ open: true });
              }}
              style={({ pressed }) => [
                styles.transferBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.pressed : "transparent",
                  opacity: selectedIds.size === 0 ? 0.55 : 1,
                },
              ]}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.text} />
              <ThemedText style={{ color: colors.text, fontWeight: "900" }}>Transfer</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}
      <TransferProfilesSheet />
      <TransferProfilesConfirmSheet />
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      <ThemedText
        style={{
          fontWeight: active ? "800" : "600",
          color: active ? colors.text : colors.textSecondary,
        }}
      >
        {label}
      </ThemedText>
      {active ? <View style={[styles.tabIndicator, { backgroundColor: colors.tint }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },

  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },

  tabIndicator: { position: "absolute", bottom: 0, height: 2, width: "60%", borderRadius: 2 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "space-between",
  },

  left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  editIconBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999, marginLeft: 2 },

  right: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 12 },

  profileAvatar: { width: 44, height: 44, borderRadius: 999 },

  ownerAvatar: { width: 22, height: 22, borderRadius: 999 },

  createAvatar: {
    backgroundColor: "transparent",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  handleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },

  publicBadge: { fontSize: 13, opacity: 0.9 },

  selectBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  useBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
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

  transferBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});