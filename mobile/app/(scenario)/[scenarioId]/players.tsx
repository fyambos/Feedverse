import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { Avatar } from "@/components/ui/Avatar";

type PlayerRow = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  profiles: { id: string; displayName: string; handle: string; avatarUrl: string | null }[];
};

export default function PlayersScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const params = useLocalSearchParams();
  const scenarioId = String((params as any)?.scenarioId ?? "").trim();

  const app = useAppData() as any;
  const db = app?.db as any;

  const scenario = useMemo(() => {
    if (!scenarioId) return null;
    try {
      if (typeof app?.getScenarioById === "function") return app.getScenarioById(scenarioId);
    } catch {
      // ignore
    }
    return (db as any)?.scenarios?.[scenarioId] ?? null;
  }, [app, db, scenarioId]);

  const rows = useMemo<PlayerRow[]>(() => {
    if (!scenarioId) return [];

    const profilesRaw: any[] = (() => {
      try {
        if (typeof app?.listProfilesForScenario === "function") return app.listProfilesForScenario(scenarioId) ?? [];
      } catch {
        // ignore
      }
      const map = (db as any)?.profiles ?? {};
      return Object.values(map).filter((p: any) => String(p?.scenarioId ?? "") === scenarioId);
    })();

    const profiles = profilesRaw
      .map((p: any) => ({
        id: String(p?.id ?? ""),
        ownerUserId: String(p?.ownerUserId ?? ""),
        displayName: String(p?.displayName ?? "") || String(p?.handle ?? "") || "(unnamed)",
        handle: String(p?.handle ?? ""),
        avatarUrl: p?.avatarUrl ? String(p.avatarUrl) : null,
      }))
      .filter((p: any) => p.id);

    const explicitIds: string[] = Array.isArray((scenario as any)?.playerIds)
      ? (scenario as any).playerIds.map(String).filter(Boolean)
      : [];

    const ownerId = String((scenario as any)?.ownerUserId ?? "").trim();

    const idSet = new Set<string>();
    if (ownerId) idSet.add(ownerId);
    for (const pid of explicitIds) idSet.add(String(pid));

    // If we don't have a player list, derive from profiles (local mode / imported scenarios).
    if (idSet.size === 0) {
      for (const p of profiles) {
        const uid = String((p as any)?.ownerUserId ?? "").trim();
        if (uid) idSet.add(uid);
      }
    }

    const usersMap = (db as any)?.users ?? {};

    const byUser: Record<string, PlayerRow> = {};

    for (const uid of idSet) {
      const u = usersMap?.[uid];
      const username = u?.username ? `@${String(u.username)}` : uid;
      byUser[uid] = {
        userId: uid,
        username,
        avatarUrl: u?.avatarUrl ? String(u.avatarUrl) : null,
        profiles: [],
      };
    }

    for (const p of profiles) {
      const uid = String((p as any)?.ownerUserId ?? "").trim();
      if (!uid) continue;

      if (!byUser[uid]) {
        const u = usersMap?.[uid];
        const username = u?.username ? `@${String(u.username)}` : uid;
        byUser[uid] = {
          userId: uid,
          username,
          avatarUrl: u?.avatarUrl ? String(u.avatarUrl) : null,
          profiles: [],
        };
      }

      byUser[uid].profiles.push({
        id: p.id,
        displayName: p.displayName,
        handle: p.handle,
        avatarUrl: p.avatarUrl,
      });
    }

    const items = Object.values(byUser);

    // Sort players: owner first (if known), then by username.
    items.sort((a, b) => {
      if (ownerId && a.userId === ownerId) return -1;
      if (ownerId && b.userId === ownerId) return 1;
      return String(a.username).localeCompare(String(b.username));
    });

    // Sort profiles within each player.
    for (const it of items) {
      it.profiles.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    }

    return items;
  }, [app, db, scenario, scenarioId]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.icon} />
          </Pressable>

          <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
            Players
          </ThemedText>

          <View style={{ width: 22 }} />
        </View>

        {!scenarioId ? (
          <View style={styles.container}>
            <ThemedText style={{ color: colors.textSecondary }}>Missing scenarioId.</ThemedText>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.container}>
            <ThemedText style={{ color: colors.textSecondary }}>No players found.</ThemedText>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.userId}
            contentContainerStyle={[styles.container, { paddingBottom: 24 }]}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const isOwner = String((scenario as any)?.ownerUserId ?? "") === item.userId;
              const subtitlePieces: string[] = [];
              if (isOwner) subtitlePieces.push("Owner");
              subtitlePieces.push(`Characters: ${item.profiles.length}`);

              const preview = item.profiles
                .slice(0, 3)
                .map((p) => p.displayName)
                .filter(Boolean);
              const previewText = preview.length ? preview.join(" · ") + (item.profiles.length > 3 ? " · …" : "") : "";

              return (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.row}>
                    <Avatar uri={item.avatarUrl} size={42} fallbackColor={colors.border} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <ThemedText style={{ color: colors.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
                        {item.username}
                      </ThemedText>
                      <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                        {subtitlePieces.join(" • ")}
                      </ThemedText>
                      {previewText ? (
                        <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                          {previewText}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>

                  {item.profiles.length > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      {item.profiles.slice(0, 5).map((p) => {
                        const label = p.handle ? `${p.displayName} (@${p.handle})` : p.displayName;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => {
                              router.push({
                                pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
                                params: { scenarioId, profileId: p.id },
                              } as any);
                            }}
                            style={({ pressed }) => [
                              styles.profileRow,
                              {
                                borderColor: colors.border,
                                backgroundColor: pressed ? colors.pressed : colors.background,
                              },
                            ]}
                          >
                            <Avatar uri={p.avatarUrl} size={26} fallbackColor={colors.border} />
                            <ThemedText style={{ color: colors.text, fontWeight: "700", marginLeft: 8, flex: 1 }} numberOfLines={1}>
                              {label}
                            </ThemedText>
                            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )}
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
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
  },
});
