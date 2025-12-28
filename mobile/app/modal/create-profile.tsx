// mobile/app/modal/create-profile.tsx

import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import { ProfileAvatarPicker } from "@/components/profile-edit/ProfileAvatarPicker";
import { ProfileSettingsSection } from "@/components/profile-edit/ProfileSettingSection";

import {
  PROFILE_LIMITS,
  digitsOnly,
  clampInt,
  normalizeBio,
  normalizeHandle,
  normalizeLink,
  normalizeLocation,
  trimTo,
} from "@/lib/profileForm";

/* -------------------------------------------------------------------------- */

export default function CreateProfileModal() {
  const { scenarioId, profileId } = useLocalSearchParams<{
    scenarioId: string;
    profileId?: string;
  }>();

  const sid = String(scenarioId ?? "");
  const isEdit = !!profileId;

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const { getProfileById, upsertProfile, listProfilesForScenario } = useAppData();

  const existing = useMemo(() => {
    if (!isEdit || !profileId) return null;
    return getProfileById(String(profileId));
  }, [isEdit, profileId, getProfileById]);

  /* -------------------------------------------------------------------------- */
  /* Form state                                                                 */
  /* -------------------------------------------------------------------------- */

  const [displayName, setDisplayName] = useState(existing?.displayName ?? "");
  const [handle, setHandle] = useState(existing?.handle ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(existing?.avatarUrl ?? null);

  // Shared means "other users can play/use this character"
  const [isPublic, setIsPublic] = useState<boolean>(existing?.isPublic ?? true);

  // Private account is purely UI (lock + protected posts UI)
  const [isPrivate, setIsPrivate] = useState<boolean>(existing?.isPrivate ?? false);

  const [followingText, setFollowingText] = useState<string>(
    existing && (existing as any)?.following != null ? String((existing as any).following) : ""
  );
  const [followersText, setFollowersText] = useState<string>(
    existing && (existing as any)?.followers != null ? String((existing as any).followers) : ""
  );

  const initialJoinedISO = (existing as any)?.joinedDate ?? existing?.createdAt ?? new Date().toISOString();
  const [joinedDate, setJoinedDate] = useState<Date>(new Date(initialJoinedISO));

  const [location, setLocation] = useState((existing as any)?.location ?? "");
  const [link, setLink] = useState((existing as any)?.link ?? "");

  const [submitting, setSubmitting] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* Submit                                                                     */
  /* -------------------------------------------------------------------------- */

  const submit = async () => {
    if (submitting) return;

    const safeDisplayName = trimTo(displayName, PROFILE_LIMITS.MAX_DISPLAY_NAME);
    const safeHandle = normalizeHandle(handle);
    const safeBio = normalizeBio(bio);
    const safeLocation = normalizeLocation(location);
    const safeLink = normalizeLink(link);

    if (!safeDisplayName || !safeHandle) {
      Alert.alert("Missing fields", "Display name and handle are required.");
      return;
    }
    if (!userId) {
      Alert.alert("Not logged in", "You need a user to create a profile.");
      return;
    }

    // handle must be unique per scenario (exclude self when editing)
    const conflict = listProfilesForScenario(sid).find(
      (p) => String(p.id) !== String(existing?.id ?? "") && normalizeHandle(p.handle) === safeHandle
    );

    if (conflict) {
      Alert.alert("Handle taken", "This handle is already used in this scenario.");
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const createdAt = existing?.createdAt ?? now;

      const followers = followersText.trim().length
        ? clampInt(Number(digitsOnly(followersText)) || 0, 0, PROFILE_LIMITS.MAX_COUNT)
        : undefined;

      const rawFollowing = followingText.trim().length
        ? clampInt(Number(digitsOnly(followingText)) || 0, 0, PROFILE_LIMITS.MAX_COUNT)
        : undefined;

      let following = rawFollowing;

      // keep invariant: following < followers when possible (only if both exist)
      if (followers != null && following != null && followers > 0 && following >= followers) {
        following = Math.max(0, followers - 1);
      }

      await upsertProfile({
        id: existing?.id ?? `profile_${Date.now()}`,
        scenarioId: sid,
        ownerUserId: String(userId),

        displayName: safeDisplayName,
        handle: safeHandle,
        bio: safeBio ? safeBio : undefined,

        avatarUrl: avatarUrl ?? undefined,

        isPublic,
        isPrivate,

        followers,
        following,
        joinedDate: joinedDate.toISOString(),
        location: safeLocation ? safeLocation : undefined,
        link: safeLink ? safeLink : undefined,

        createdAt,
        updatedAt: now,
      } as any);

      router.back();
    } catch {
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>

            <ThemedText type="defaultSemiBold">{isEdit ? "Edit profile" : "Create profile"}</ThemedText>

            <Pressable
              onPress={submit}
              disabled={submitting}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: submitting ? 0.5 : pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>
                {isEdit ? "Save" : "Create"}
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Avatar */}
            <ProfileAvatarPicker avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} colors={colors} />

            {/* Basic fields */}
            <View style={styles.form}>
              <TextInput
                value={displayName}
                onChangeText={(v) => setDisplayName(v.slice(0, PROFILE_LIMITS.MAX_DISPLAY_NAME))}
                placeholder="Display name"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />

              <View style={[styles.handleWrap, { borderColor: colors.border }]}>
                <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>@</ThemedText>

                <TextInput
                  value={handle}
                  onChangeText={(v) => setHandle(normalizeHandle(v))}
                  placeholder="handle"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="ascii-capable"
                  maxLength={PROFILE_LIMITS.MAX_HANDLE}
                  style={[styles.handleInput, { color: colors.text }]}
                />
              </View>

              <TextInput
                value={bio}
                onChangeText={(v) => setBio(v.slice(0, PROFILE_LIMITS.MAX_BIO))}
                placeholder="Bio (optional)"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[styles.input, styles.bio, { color: colors.text, borderColor: colors.border }]}
              />
            </View>

            {/* Settings (extracted) */}
            <ProfileSettingsSection
              colors={colors}
              isPublic={isPublic}
              setIsPublic={setIsPublic}
              isPrivate={isPrivate}
              setIsPrivate={setIsPrivate}
              followersText={followersText}
              setFollowersText={setFollowersText}
              followingText={followingText}
              setFollowingText={setFollowingText}
              joinedDate={joinedDate}
              setJoinedDate={setJoinedDate}
              location={location}
              setLocation={setLocation}
              link={link}
              setLink={setLink}
              maxLocation={PROFILE_LIMITS.MAX_LOCATION}
              maxLink={PROFILE_LIMITS.MAX_LINK}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  form: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 10,
  },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  bio: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  handleWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  handleInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
});