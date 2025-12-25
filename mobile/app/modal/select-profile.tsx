import React from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

type TabKey = "mine" | "public";

export default function SelectProfileModal() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const { userId } = useAuth();

  const {
    isReady,
    listProfilesForScenario,
    getSelectedProfileId,
    setSelectedProfileId,
    getUserById,
  } = useAppData() as any;

  const [tab, setTab] = React.useState<TabKey>("mine");

  const allProfiles = React.useMemo(() => {
    if (!isReady) return [];
    return listProfilesForScenario(sid);
  }, [isReady, sid, listProfilesForScenario]);

  const mine = React.useMemo(
    () => allProfiles.filter((p: any) => p.ownerUserId === String(userId)),
    [allProfiles, userId]
  );

  const publicProfiles = React.useMemo(
    () =>
      allProfiles.filter(
        (p: any) =>
          p.isPublic && p.ownerUserId !== String(userId)
      ),
    [allProfiles, userId]
  );

  const data = tab === "mine" ? mine : publicProfiles;
  const current = getSelectedProfileId(sid);

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
          Choose profile
        </ThemedText>

        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TabButton
          label="Mine"
          active={tab === "mine"}
          onPress={() => setTab("mine")}
          colors={colors}
        />
        <TabButton
          label="Public"
          active={tab === "public"}
          onPress={() => setTab("public")}
          colors={colors}
        />
      </View>

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(p) => String(p.id)}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        )}
        renderItem={({ item }) => {
          const active = String(item.id) === String(current);
          const owner = getUserById?.(String(item.ownerUserId));

          return (
            <Pressable
              onPress={async () => {
                await setSelectedProfileId(sid, String(item.id));
                router.back();
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.pressed : colors.background },
              ]}
            >
              {/* LEFT */}
              <View style={styles.left}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.profileAvatar} />
                ) : (
                  <View style={[styles.profileAvatar, { backgroundColor: colors.border }]} />
                )}

                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {item.displayName}
                  </ThemedText>

                  <View style={styles.handleRow}>
                    <ThemedText numberOfLines={1} style={{ color: colors.textSecondary }}>
                      @{item.handle}
                    </ThemedText>

                    {item.isPublic ? (
                      <ThemedText style={[styles.publicBadge, { color: colors.textSecondary }]}>
                        {" "}
                        • Public
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* RIGHT */}
              <View style={styles.right}>
                {owner?.avatarUrl ? (
                  <Image source={{ uri: owner.avatarUrl }} style={styles.ownerAvatar} />
                ) : (
                  <View style={[styles.ownerAvatar, { backgroundColor: colors.border }]} />
                )}

                <ThemedText
                  numberOfLines={1}
                  style={{ fontSize: 12, color: colors.textSecondary }}
                >
                  {owner?.username ?? item.ownerUserId}
                </ThemedText>

                {active ? (
                  <ThemedText style={{ color: colors.tint, fontWeight: "800", marginLeft: 6 }}>
                    ✓
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={() => (
          <View style={{ padding: 24 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              {tab === "mine"
                ? "You don’t own any profiles in this scenario."
                : "No public profiles available."}
            </ThemedText>
          </View>
        )}
        ListFooterComponent={
          tab === "mine" ? (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

              <Pressable
                onPress={() => {
                  router.push({
                    pathname: "/modal/create-profile",
                    params: { scenarioId: sid },
                  } as any);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.pressed : colors.background },
                ]}
              >
                <View style={[styles.profileAvatar, styles.createAvatar, { borderColor: colors.border }]}>
                  <Ionicons name="add" size={22} color={colors.tint} />
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
                    Create a new profile
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary }}>
                    Add a character for this scenario
                  </ThemedText>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Small Tab Button                                                           */
/* -------------------------------------------------------------------------- */

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
      {active ? (
        <View style={[styles.tabIndicator, { backgroundColor: colors.tint }]} />
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  tabs: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },

  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 2,
    width: "60%",
    borderRadius: 2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "space-between",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },

  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 12,
  },

  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
  },

  ownerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },

  createAvatar: {
    backgroundColor: "transparent",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  publicBadge: {
    fontSize: 13,
    opacity: 0.9,
  },
});
