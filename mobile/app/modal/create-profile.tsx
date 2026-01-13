import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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
import { Alert } from "@/context/dialog";

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

import { MAX_TOTAL_PROFILES_PER_SCENARIO } from "@/lib/rules";

/* -------------------------------------------------------------------------- */

export default function CreateProfileModal() {
  const { scenarioId, profileId, forced } = useLocalSearchParams<{
    scenarioId: string;
    profileId?: string;
    forced?: string;
  }>();

  const sid = String(scenarioId ?? "");
  const isEdit = !!profileId;

  const isForced = String(forced ?? "") === "1";
  const hideClose = isForced && !isEdit;

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const { getProfileById, upsertProfile, listProfilesForScenario, deleteProfileCascade } = useAppData();

  const existing = useMemo(() => {
    if (!isEdit || !profileId) return null;
    return getProfileById(String(profileId));
  }, [isEdit, profileId, getProfileById]);

  // only the owner can change the "Shared" flag
  const isOwner = !existing || String(existing.ownerUserId) === String(userId);

  // only the owner can delete the profile
  const canDelete = Boolean(existing && String(existing.ownerUserId) === String(userId));

  // remove confirm-delete modal state (use Alert.alert instead)
  // const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // const closeConfirmDelete = () => setConfirmDeleteOpen(false);

  // when editing, existing can load/refresh after first render => keep form in sync
  useEffect(() => {
    if (!existing) return;

    setDisplayName(existing.displayName ?? "");
    setHandle(existing.handle ?? "");
    setBio(existing.bio ?? "");
    setAvatarUrl(existing.avatarUrl ?? null);

    setIsPublic(!!existing.isPublic);
    setIsPrivate(!!existing.isPrivate);

    setFollowingText(
      (existing as any)?.followingCount != null ? String((existing as any).followingCount) : ""
    );
    setFollowersText(
      (existing as any)?.followerCount != null ? String((existing as any).followerCount) : ""
    );

    const joinedISO = (existing as any)?.joinedDate ?? existing.createdAt ?? new Date().toISOString();
    setJoinedDate(new Date(joinedISO));

    setLocation((existing as any)?.location ?? "");
    setLink((existing as any)?.link ?? "");
  }, [existing]);

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
    existing && (existing as any)?.followingCount != null ? String((existing as any).followingCount) : ""
  );

  const [followersText, setFollowersText] = useState<string>(
    existing && (existing as any)?.followerCount != null ? String((existing as any).followerCount) : ""
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

    // scenario-level cap: when full, users must ask an admin to transfer a profile
    if (!isEdit) {
      const totalScenarioCount = listProfilesForScenario(sid).length;
      if (totalScenarioCount >= MAX_TOTAL_PROFILES_PER_SCENARIO) {
        Alert.alert(
          "All spots taken",
          "This scenario has reached the maximum number of profiles. Ask an admin to transfer you a profile."
        );
        return;
      }
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

     const followerCount = followersText.trim().length
        ? clampInt(Number(digitsOnly(followersText)) || 0, 0, PROFILE_LIMITS.MAX_COUNT)
        : undefined;

      const rawFollowingCount = followingText.trim().length
        ? clampInt(Number(digitsOnly(followingText)) || 0, 0, PROFILE_LIMITS.MAX_COUNT)
        : undefined;

      let followingCount = rawFollowingCount;

      if (followerCount != null && followingCount != null && followerCount > 0 && followingCount >= followerCount) {
        followingCount = Math.max(0, followerCount - 1);
      }

      await upsertProfile({
        id: existing?.id ?? `profile_${Date.now()}`,
        scenarioId: sid,
        ownerUserId: existing?.ownerUserId ?? String(userId),

        displayName: safeDisplayName,
        handle: safeHandle,
        bio: safeBio ? safeBio : undefined,

        avatarUrl: avatarUrl ?? undefined,

        isPublic: isOwner ? isPublic : !!existing?.isPublic,
        isPrivate,

        followerCount,
        followingCount,
        joinedDate: joinedDate.toISOString(),
        location: safeLocation ? safeLocation : undefined,
        link: safeLink ? safeLink : undefined,

        createdAt,
        updatedAt: now,
      } as any);

      if (isForced && !isEdit) {
        router.replace({
          pathname: "/modal/select-profile",
          params: { scenarioId: sid, afterCreate: "1" },
        } as any);
        return;
      }

      router.back();
    } catch {
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!existing) return;
    if (!canDelete) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await deleteProfileCascade(String(sid), String(existing.id));
      if (!res || !res.ok) {
        Alert.alert("Delete failed", String((res as any)?.error ?? "Could not delete profile."));
        return;
      }
      router.back();
    } catch {
      Alert.alert("Delete failed", "Could not delete profile.");
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
            {hideClose ? (
              // keep layout stable when the close button is hidden
              <View style={{ width: 24, height: 24 }} />
            ) : (
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            )}

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
                maxLength={PROFILE_LIMITS.MAX_DISPLAY_NAME}
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
              canEditShared={isOwner}
            />

            {isEdit && canDelete ? (
              <View style={styles.deleteSection}>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Delete profile?",
                      "This will delete all posts, likes, reposts, and messages related to this profile.",
                      [
                        {
                          text: "Cancel",
                          style: "cancel",
                          icon: { name: "close-outline", color: colors.textSecondary, size: 18 },
                        },
                        {
                          text: "Delete",
                          style: "destructive",
                          icon: { name: "trash-outline", color: "#ff3b30", size: 18 },
                          onPress: onConfirmDelete,
                        },
                      ]
                    );
                  }}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.pressed : (colors as any).card,
                      opacity: submitting ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText style={styles.deleteText}>Delete profile</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          {/* remove confirm delete Modal */}
          {/*
          <Modal transparent visible={confirmDeleteOpen} animationType="fade" onRequestClose={closeConfirmDelete}>
            ...existing code...
          </Modal>
          */}
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

  deleteSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  deleteBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: {
    color: "#ff3b30",
    fontWeight: "900",
  },

  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    padding: 14,
  },
  confirmCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  confirmBtnsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  confirmBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});