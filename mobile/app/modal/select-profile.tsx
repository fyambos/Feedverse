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
  } = useAppData();

  // show only profiles owned by current user
  const profiles = React.useMemo(() => {
    if (!isReady) return [];
    return listProfilesForScenario(sid).filter((p) => p.ownerUserId === String(userId ?? ""));
  }, [isReady, sid, listProfilesForScenario, userId]);

  const current = getSelectedProfileId(sid);

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
          Choose profile
        </ThemedText>

        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>Done</ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(p) => String(p.id)}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        )}
        renderItem={({ item }) => {
          const active = String(item.id) === String(current);

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
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.border }]} />
              )}

              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">{item.displayName}</ThemedText>
                <View style={styles.handleRow}>
                  <ThemedText style={{ color: colors.textSecondary }}>
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

              {active ? (
                <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>✓</ThemedText>
              ) : null}
            </Pressable>
          );
        }}
        ListFooterComponent={() => (
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
              <View style={[styles.avatar, styles.createAvatar, { borderColor: colors.border }]}>
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
        )}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              {isReady
                ? `No profiles available for this scenario ${sid}.`
                : "Loading…"}
            </ThemedText>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 999 },
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
