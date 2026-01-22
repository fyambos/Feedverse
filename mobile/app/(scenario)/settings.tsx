// mobile/app/(scenario)/settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RowCard } from "@/components/ui/RowCard";
import { ProfileAvatarPicker } from "@/components/profile-edit/ProfileAvatarPicker";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/context/auth";
import { Alert } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/utils/format";
import {
  getUsernameValidationError,
  normalizeUsernameInput,
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
} from "@/lib/validation/auth";

import type { UserSettings } from "@/data/db/schema";

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
    customTheme: typeof s?.customTheme === "string" ? s.customTheme : "",
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

  const usernameHint = useMemo(
    () => `Use letters, numbers, and underscores (${USERNAME_MIN_LEN}-${USERNAME_MAX_LEN}).`,
    []
  );

  // keep draft in sync when user loads / changes
  useEffect(() => {
    setDraft(normalizeSettings(user?.settings));
    setUsername(user?.username ?? "");
    setUsernameError(null);
  }, [user?.settings, user?.username]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user?.avatarUrl]);

  const save = async () => {
    if (!userId) return;

    const normalizedUsername = normalizeUsernameInput(username);
    if (normalizedUsername !== username) setUsername(normalizedUsername);

    if (normalizedUsername !== (user?.username ?? "")) {
      const vErr = getUsernameValidationError(normalizedUsername);
      if (vErr) {
        setUsernameError(vErr);
        return;
      }

      setIsSavingUsername(true);
      setUsernameError(null);
      try {
        await updateUsername(normalizedUsername);
      } catch (e: any) {
        setUsernameError(formatErrorMessage(e, "Could not update username"));
        setIsSavingUsername(false);
        return;
      }
      setIsSavingUsername(false);
    }

    try {
      await updateUserSettings(draft);
      await updateUserAvatar(avatarUrl);
    } catch (e: any) {
      Alert.alert("Save failed", formatErrorMessage(e, "Could not save settings"));
      return;
    }

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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          {/* top bar */}
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.icon} />
            </Pressable>

            <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
              Settings
            </ThemedText>

            <Pressable
              onPress={save}
              disabled={isSavingUsername}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: isSavingUsername ? 0.5 : pressed ? 0.7 : 1 }]}
            >
              <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
                {isSavingUsername ? "Saving…" : "Save"}
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            <ThemedView style={{ gap: 12 }}>
              {/* USER AVATAR */}
              <ProfileAvatarPicker avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} colors={colors} />

              {/* ACCOUNT - Username editing */}
              <RowCard label="Username" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                  value={username}
                  onChangeText={(t) => {
                    setUsernameError(null);
                    setUsername(normalizeUsernameInput(t));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Username"
                  placeholderTextColor={colors.textMuted}
                  editable={!isSavingUsername}
                />
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                  {usernameHint}
                </ThemedText>
                {usernameError ? (
                  <ThemedText style={{ color: "#d00", fontSize: 12, marginTop: 6 }}>
                    {usernameError}
                  </ThemedText>
                ) : null}
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

              {/* SESSIONS */}
              <RowCard
                label="Security"
                colors={colors}
                right={<Ionicons name="chevron-forward" size={18} color={colors.icon} />}
              >
                <Pressable
                  onPress={() => router.push({ pathname: "/(scenario)/settings/sessions" } as any)}
                  hitSlop={8}
                >
                  <ThemedText style={{ color: colors.text }}>Sessions</ThemedText>
                  <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }}>
                    Devices where you’re logged in
                  </ThemedText>
                </Pressable>
              </RowCard>

              <ThemedText style={styles.footer}>
                These settings apply to your user account, not individual profiles.
              </ThemedText>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
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

  input: {
    fontSize: 16,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },

  footer: {
    marginTop: 8,
    fontSize: 12,
    color: "#888",
  },
});