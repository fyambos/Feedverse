// mobile/app/(scenario)/settings.tsx
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, TextInput } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RowCard } from "@/components/ui/RowCard";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useState as useAsyncState } from "react";
import type { UserSettings } from "@/data/db/schema";

import { ProfileAvatarPicker } from "@/components/profile-edit/ProfileAvatarPicker";
import { Alert } from "@/context/dialog";

type DarkMode = "light" | "dark" | "system";

const DARK_MODE_LABEL: Record<DarkMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function normalizeSettings(s?: UserSettings): Required<UserSettings> {
  return {
    showTimestamps: s?.showTimestamps ?? true,
    darkMode: s?.darkMode ?? "system",
  };
}

export default function UserSettingsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId, currentUser, updateUserSettings, updateUserAvatar, updateUsername } = useAuth();

  const user = currentUser ?? null;

  const [draft, setDraft] = useState<Required<UserSettings>>(normalizeSettings(user?.settings));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [username, setUsername] = useState(user?.username ?? "");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // keep draft in sync when user loads / changes
  useEffect(() => {
    setDraft(normalizeSettings(user?.settings));
    setUsername(user?.username ?? "");
  }, [user?.settings, user?.username]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user?.avatarUrl]);

  const save = async () => {
    if (!userId) return;
    if (username !== user?.username) {
      setIsSavingUsername(true);
      setUsernameError(null);
      try {
        await updateUsername(username);
      } catch (e: any) {
        setUsernameError(e?.message || "Could not update username");
        setIsSavingUsername(false);
        return;
      }
      setIsSavingUsername(false);
    }
    await updateUserSettings(draft);
    await updateUserAvatar(avatarUrl);
    router.back();
  };

  const pickTheme = () => {
    Alert.alert("Theme", "Choose appearance", [
      {
        text: "System",
        icon: { name: "phone-portrait-outline", color: colors.icon, size: 18 },
        onPress: () => setDraft((p) => ({ ...p, darkMode: "system" })),
      },
      {
        text: "Light",
        icon: { name: "sunny-outline", color: colors.icon, size: 18 },
        onPress: () => setDraft((p) => ({ ...p, darkMode: "light" })),
      },
      {
        text: "Dark",
        icon: { name: "moon-outline", color: colors.icon, size: 18 },
        onPress: () => setDraft((p) => ({ ...p, darkMode: "dark" })),
      },
      {
        text: "Cancel",
        style: "cancel",
        icon: { name: "close-outline", color: colors.textSecondary, size: 18 },
      },
    ]);
  };

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
            Settings
          </ThemedText>

          <Pressable onPress={save} hitSlop={10}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
              Save
            </ThemedText>
          </Pressable>
        </View>

        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          {/* USER AVATAR */}
          <ProfileAvatarPicker avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} colors={colors} />

          {/* ACCOUNT - Username editing */}
          <RowCard label="Account" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextInput
                style={{
                  color: colors.text,
                  fontSize: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  minWidth: 120,
                  flex: 1,
                  paddingVertical: 2,
                }}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Username"
                editable={!isSavingUsername}
              />
              {isSavingUsername && (
                <ThemedText style={{ color: colors.tint, marginLeft: 8 }}>Saving…</ThemedText>
              )}
            </View>
            {usernameError && (
              <ThemedText style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>{usernameError}</ThemedText>
            )}
          </RowCard>

          {/* SHOW TIMESTAMPS */}
          <RowCard
            label="Timestamps"
            colors={colors}
            right={
              <Pressable
                onPress={() => setDraft((p) => ({ ...p, showTimestamps: !p.showTimestamps }))}
                hitSlop={8}
              >
                <Ionicons
                  name={draft.showTimestamps ? "checkbox" : "square-outline"}
                  size={22}
                  color={draft.showTimestamps ? colors.tint : colors.icon}
                />
              </Pressable>
            }
          >
            <ThemedText style={{ color: colors.text }}>Show post timestamps</ThemedText>
            <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
              Relative and detailed dates in feeds
            </ThemedText>
          </RowCard>

          {/* THEME */}
          <RowCard
            label="Appearance"
            colors={colors}
            right={<Ionicons name="chevron-forward" size={18} color={colors.icon} />}
          >
            <Pressable onPress={pickTheme} hitSlop={8}>
              <ThemedText style={{ color: colors.text }}>Theme</ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                {DARK_MODE_LABEL[draft.darkMode]}
              </ThemedText>
            </Pressable>
          </RowCard>

          <ThemedText style={styles.footer}>
            These settings apply to your user account, not individual profiles.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  footer: {
    marginTop: 8,
    fontSize: 12,
    color: "#888",
  },
});