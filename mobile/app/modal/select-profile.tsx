
// mobile/app/modal/select-profile.tsx
import React from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

import type { Profile } from "@/data/db/schema";
import { canEditProfile } from "@/lib/permission";

import {
  MAX_OWNED_PROFILES_PER_USER,
  canCreateOwnedProfileForUser,
  countOwnedProfilesForUser,
} from "@/lib/rules";

type TabKey = "mine" | "public";
type ViewMode = "tabs" | "all"; // tabs = Mine/Public, all = single list (no tabs)

export default function SelectProfileModal() {
  const { scenarioId, afterCreate } = useLocalSearchParams<{ scenarioId: string; afterCreate?: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const { userId } = useAuth();

  const { isReady, listProfilesForScenario, getSelectedProfileId, setSelectedProfileId, db } = useAppData();

  const usersMap = (db as any)?.users ?? {};

  const [tab, setTab] = React.useState<TabKey>("mine");
  const [mode, setMode] = React.useState<ViewMode>("tabs");

  const allProfiles = React.useMemo(() => {
    if (!isReady) return [];
    return listProfilesForScenario(sid);
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

  const ownedNonSharedCount = React.useMemo(() => {
    return countOwnedProfilesForUser(allProfiles, userId ?? null);
  }, [allProfiles, userId]);

  const canCreate = React.useMemo(() => {
    return canCreateOwnedProfileForUser(allProfiles, userId ?? null);
  }, [allProfiles, userId]);

  const Row = ({ item }: { item: Profile }) => {
    const selectEnabled = mode !== "all";
    const active = String(item.id) === String(current);

    const owner = usersMap[String(item.ownerUserId)] ?? null;

    const canEditThis = canEditProfile({
      profile: item,
      userId: userId ?? null,
      selectedProfileId: current ?? null,
    });

    return (
      <Pressable
        disabled={!selectEnabled}
        onPress={async () => {
          if (!selectEnabled) return;
          await setSelectedProfileId(sid, String(item.id));

          // If this modal was opened right after forced profile creation,
          // we should enter the scenario feed instead of returning to the scenario list.
          if (String(afterCreate ?? "") === "1") {
            router.replace(`/(scenario)/${sid}` as any);
            return;
          }

          router.back();
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed && selectEnabled ? colors.pressed : colors.background,
            opacity: selectEnabled ? 1 : 0.88,
          },
        ]}
      >
        <View style={styles.left}>
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
                <ThemedText style={[styles.publicBadge, { color: colors.textSecondary }]}> • Shared</ThemedText>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.right}>
          {owner?.avatarUrl ? (
            <Image source={{ uri: owner.avatarUrl }} style={styles.ownerAvatar} />
          ) : (
            <View style={[styles.ownerAvatar, { backgroundColor: colors.border }]} />
          )}

          <ThemedText numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary }}>
            {owner?.username ?? "unknown"}
          </ThemedText>

          {selectEnabled && active ? (
            <ThemedText style={{ color: colors.tint, fontWeight: "800", marginLeft: 6 }}>✓</ThemedText>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const CreateProfileHeader = () => {
    if (!(mode === "tabs" && tab === "mine")) return null;

    const disabled = !canCreate;

    return (
      <View>
        <Pressable
          disabled={disabled}
          onPress={() => {
            if (disabled) return;
            router.push({
              pathname: "/modal/create-profile",
              params: { scenarioId: sid },
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

            {disabled ? (
              <ThemedText style={{ color: colors.textSecondary }}>
                Limit reached ({MAX_OWNED_PROFILES_PER_USER} owned profiles).
              </ThemedText>
            ) : (
              <ThemedText style={{ color: colors.textSecondary }}>Add a character for this scenario</ThemedText>
            )}
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
            Owned profiles: {ownedNonSharedCount}/{MAX_OWNED_PROFILES_PER_USER} (shared profiles don’t count)
          </ThemedText>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </View>
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
        ListHeaderComponent={CreateProfileHeader}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
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
});