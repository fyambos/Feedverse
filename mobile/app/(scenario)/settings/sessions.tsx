import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RowCard } from "@/components/ui/RowCard";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/context/auth";
import { Alert } from "@/context/dialog";
import { formatErrorMessage, formatRelativeTime } from "@/lib/format";

function Badge({ text, colors }: { text: string; colors: any }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.tint }]}>
      <ThemedText type="defaultSemiBold" style={{ color: "#fff", fontSize: 12 }}>
        {text}
      </ThemedText>
    </View>
  );
}

export default function SessionsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { token, fetchWithAuth } = useAuth();

  type SessionApi = {
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: string;
    lastSeenAt: string;
    isCurrent: boolean;
  };

  const [currentSession, setCurrentSession] = useState<SessionApi | null>(null);
  const [otherSessions, setOtherSessions] = useState<SessionApi[]>([]);
  const [loading, setLoading] = useState(false);

  const deviceLabel = useMemo(() => {
    if (Platform.OS === "ios") return "iPhone";
    if (Platform.OS === "android") return "Android";
    return "This device";
  }, []);

  const load = useCallback(async () => {
    const t = String(token ?? "").trim();
    if (!t) {
      setCurrentSession(null);
      setOtherSessions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth("/users/sessions");
      if (!res.ok) {
        throw new Error(
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : res.text || `Failed to load sessions (HTTP ${res.status})`,
        );
      }

      const json = (res.json ?? {}) as any;
      const cur = json?.currentSession ?? null;
      const others = Array.isArray(json?.otherSessions) ? json.otherSessions : [];

      setCurrentSession(cur);
      setOtherSessions(others);
    } catch (e: unknown) {
      setCurrentSession(null);
      setOtherSessions([]);
      Alert.alert("Sessions", formatErrorMessage(e, "Could not load sessions"));
    }
    setLoading(false);
  }, [token, fetchWithAuth]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const logoutOthers = useCallback(() => {
    if (otherSessions.length === 0) return;

    Alert.alert(
      "Log out other sessions?",
      "This will log you out on other devices.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetchWithAuth("/users/sessions/logout-others", {
                method: "POST",
              });
              if (!res.ok) {
                throw new Error(
                  typeof (res.json as any)?.error === "string"
                    ? String((res.json as any).error)
                    : res.text || `Failed (HTTP ${res.status})`,
                );
              }
              await load();
            } catch (e: unknown) {
              Alert.alert("Could not log out", formatErrorMessage(e, "Request failed"));
            }
          },
        },
      ],
    );
  }, [fetchWithAuth, load, otherSessions.length]);

  const currentLastSeen = currentSession?.lastSeenAt ? formatRelativeTime(currentSession.lastSeenAt) : "";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        {/* top bar */}
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.icon} />
          </Pressable>

          <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
            Sessions
          </ThemedText>

          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
          <ThemedText style={{ color: colors.textSecondary, marginBottom: 14 }}>
            Sessions are the devices you’re logged in on.
          </ThemedText>

          <ThemedView style={{ gap: 12 }}>
            <RowCard label="Current active session" colors={colors}>
              <View style={styles.row}>
                <View style={[styles.deviceIconWrap, { borderColor: colors.border }]}>
                  <Ionicons
                    name={Platform.OS === "ios" ? "phone-portrait-outline" : "phone-portrait-outline"}
                    size={22}
                    color={colors.icon}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                      {deviceLabel}
                    </ThemedText>
                    <Badge text="Active now" colors={colors} />
                  </View>

                  <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                    {loading
                      ? "Loading…"
                      : currentSession
                        ? `Last active ${currentLastSeen || "just now"}`
                        : "You’re currently using this session."}
                  </ThemedText>
                </View>
              </View>
            </RowCard>

            <RowCard label="Log out of other sessions" colors={colors}>
              <ThemedText style={{ color: colors.textSecondary }}>
                If you suspect someone else has access, you can end other sessions.
              </ThemedText>

              <Pressable
                disabled={otherSessions.length === 0 || loading}
                onPress={logoutOthers}
                style={({ pressed }) => [
                  styles.dangerButton,
                  {
                    borderColor: colors.border,
                    opacity: otherSessions.length === 0 || loading ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <ThemedText type="defaultSemiBold" style={{ color: "#d11" }}>
                  Log out of all other sessions
                </ThemedText>
              </Pressable>
            </RowCard>

            <RowCard label="Other sessions" colors={colors}>
              {otherSessions.length === 0 ? (
                <ThemedText style={{ color: colors.textSecondary }}>
                  No other active sessions.
                </ThemedText>
              ) : (
                <View style={{ gap: 12 }}>
                  {otherSessions.map((s) => {
                    const lastSeen = s?.lastSeenAt ? formatRelativeTime(String(s.lastSeenAt)) : "";
                    const ua = typeof s?.userAgent === "string" ? s.userAgent : "";
                    const label = /iphone|ipad|ios/i.test(ua)
                      ? "iOS"
                      : /android/i.test(ua)
                        ? "Android"
                        : "Device";

                    return (
                      <View key={s.id} style={styles.row}>
                        <View style={[styles.deviceIconWrap, { borderColor: colors.border }]}> 
                          <Ionicons name="phone-portrait-outline" size={22} color={colors.icon} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                            {label}
                          </ThemedText>
                          <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                            {`Last active ${lastSeen || "—"}`}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </RowCard>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  dangerButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
});
