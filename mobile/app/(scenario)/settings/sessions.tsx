import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RowCard } from "@/components/ui/RowCard";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

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

  const deviceLabel = useMemo(() => {
    if (Platform.OS === "ios") return "iPhone";
    if (Platform.OS === "android") return "Android";
    return "This device";
  }, []);
  const loading = false;

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

          <ThemedText style={{ color: colors.textSecondary, marginBottom: 14 }}>
            This screen is UI-only in feedverse-dev for now.
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
                    You’re currently using this session.
                  </ThemedText>
                </View>
              </View>
            </RowCard>

            <RowCard label="Log out of other sessions" colors={colors}>
              <ThemedText style={{ color: colors.textSecondary }}>
                If you suspect someone else has access, you can end other sessions.
              </ThemedText>

              <Pressable
                disabled
                style={({ pressed }) => [
                  styles.dangerButton,
                  {
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 0.5,
                  },
                ]}
              >
                <ThemedText type="defaultSemiBold" style={{ color: "#d11" }}>
                  Log out of all other sessions
                </ThemedText>
              </Pressable>
            </RowCard>

            <RowCard label="Other sessions" colors={colors}>
              <ThemedText style={{ color: colors.textSecondary }}>
                Not available until feedverse-dev is connected to a backend.
              </ThemedText>
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
