// mobile/app/modal/create-profile.tsx

import React, { useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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

import { Avatar } from "@/components/ui/Avatar";
import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { formatCount } from "@/lib/format";
import { RowCard } from "@/components/ui/RowCard";

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "");
}

function clampInt(n: number, min = 0, max = 99_000_000) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function pickFollowersForSize(size: "small" | "mid" | "big") {
  if (size === "small") return randInt(0, 500);
  if (size === "mid") return randInt(1000, 5000);
  return randInt(800_000, 3_000_000);
}

function pickFollowingBelowFollowers(followers: number) {
  if (followers <= 0) return 0;
  const max = Math.max(0, followers - 1);
  const min = Math.max(0, Math.floor(followers * 0.05));
  const hi = Math.max(min, Math.floor(followers * 0.7));
  return clampInt(randInt(min, Math.min(hi, max)), 0, max);
}

function digitsOnly(s: string) {
  return String(s).replace(/[^\d]/g, "");
}

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
  const { getProfileById, upsertProfile } = useAppData();

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

  // order requested: account size, followings, followers, joinedDate, location, link
  const [followingText, setFollowingText] = useState<string>(
    existing && (existing as any)?.following != null ? String((existing as any).following) : ""
  );
  const [followersText, setFollowersText] = useState<string>(
    existing && (existing as any)?.followers != null ? String((existing as any).followers) : ""
  );

  const initialJoinedISO =
    (existing as any)?.joinedDate ?? existing?.createdAt ?? new Date().toISOString();
  const [joinedDate, setJoinedDate] = useState<Date>(new Date(initialJoinedISO));
  const [showJoinedPicker, setShowJoinedPicker] = useState(false);

  const [location, setLocation] = useState((existing as any)?.location ?? "");
  const [link, setLink] = useState((existing as any)?.link ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* Actions                                                                    */
  /* -------------------------------------------------------------------------- */

  const pickAvatar = async () => {
    setPicking(true);
    try {
      const uri = await pickAndPersistOneImage({
        persistAs: "avatar",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (uri) setAvatarUrl(uri);
    } finally {
      setPicking(false);
    }
  };

  const setAccountSize = (size: "small" | "mid" | "big") => {
    const followers = pickFollowersForSize(size);
    const following = pickFollowingBelowFollowers(followers);
    setFollowersText(String(followers));
    setFollowingText(String(following));
  };

  const submit = async () => {
    if (submitting) return;

    if (!displayName.trim() || !handle.trim()) {
      Alert.alert("Missing fields", "Display name and handle are required.");
      return;
    }
    if (!userId) {
      Alert.alert("Not logged in", "You need a user to create a profile.");
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const createdAt = existing?.createdAt ?? now;

      const followers = followersText.trim().length
        ? clampInt(Number(digitsOnly(followersText)) || 0, 0, 99_000_000)
        : undefined;

      const rawFollowing = followingText.trim().length
        ? clampInt(Number(digitsOnly(followingText)) || 0, 0, 99_000_000)
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

        displayName: displayName.trim(),
        handle: normalizeHandle(handle),
        bio: bio.trim() || undefined,

        avatarUrl: avatarUrl ?? undefined,

        isPublic,
        isPrivate,

        followers,
        following,
        joinedDate: joinedDate.toISOString(), // default is today and is saved like this
        location: location.trim() || undefined,
        link: link.trim() || undefined,

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
        {picking ? (
          <View style={styles.pickerOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : null}

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
              style={{ opacity: submitting ? 0.5 : 1 }}
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
            <View style={styles.avatarWrap}>
              <Pressable onPress={pickAvatar} hitSlop={12}>
                <Avatar uri={avatarUrl} size={96} fallbackColor={colors.border} />
              </Pressable>

              <Pressable onPress={pickAvatar} hitSlop={12}>
                <ThemedText style={{ color: colors.tint, marginTop: 8 }}>Change avatar</ThemedText>
              </Pressable>
            </View>

            {/* Basic fields */}
            <View style={styles.form}>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />

              <TextInput
                value={handle}
                onChangeText={setHandle}
                placeholder="@handle"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />

              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Bio (optional)"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[styles.input, styles.bio, { color: colors.text, borderColor: colors.border }]}
              />
            </View>

            {/* Profile settings */}
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                Profile settings
              </ThemedText>

              {/*  Shared slider (isPublic) */}
              <RowCard
                label="Shared"
                colors={colors}
                right={
                  <Switch
                    value={!!isPublic}
                    onValueChange={(v) => setIsPublic(!!v)}
                    trackColor={{ false: colors.border, true: colors.tint }}
                    thumbColor={Platform.OS === "android" ? colors.background : undefined}
                  />
                }
              >
                <ThemedText style={{ color: colors.textSecondary }}>
                  Other players can use this profile
                </ThemedText>
              </RowCard>

              {/* Private Account slider (isPrivate) */}
              <RowCard
                label="Private account"
                colors={colors}
                right={
                  <Switch
                    value={!!isPrivate}
                    onValueChange={(v) => setIsPrivate(!!v)}
                    trackColor={{ false: colors.border, true: colors.tint }}
                    thumbColor={Platform.OS === "android" ? colors.background : undefined}
                  />
                }
              >
                <ThemedText style={{ color: colors.textSecondary }}>
                  Show a lock icon
                </ThemedText>
              </RowCard>

              {/* 1) Account size */}
              <RowCard
                label="Account size"
                colors={colors}
                right={
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => setAccountSize("small")}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.sizeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.pressed : "transparent",
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Small account"
                    >
                      <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      onPress={() => setAccountSize("mid")}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.sizeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.pressed : "transparent",
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Medium account"
                    >
                      <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      onPress={() => setAccountSize("big")}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.sizeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.pressed : "transparent",
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Big account"
                    >
                      <Ionicons name="people" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                }
              >
                <ThemedText style={{ color: colors.textSecondary }}>
                  Tap an icon to generate followers & following
                </ThemedText>
              </RowCard>

              {/* 2) Followings */}
              <RowCard
                label="Followings"
                colors={colors}
                right={
                  followingText ? (
                    <ThemedText style={{ color: colors.textSecondary }}>
                      {formatCount(Number(followingText))}
                    </ThemedText>
                  ) : (
                    <ThemedText style={{ color: colors.textSecondary, opacity: 0.4 }}>0</ThemedText>
                  )
                }
              >
                <TextInput
                  value={followingText}
                  onChangeText={(v) => {
                    const next = digitsOnly(v);
                    const f = Number(digitsOnly(followersText)) || 0;
                    const g = Number(next || "0") || 0;

                    if (f > 0 && next.length && g >= f) {
                      setFollowingText(String(Math.max(0, f - 1)));
                    } else {
                      setFollowingText(next);
                    }
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  style={[styles.rowInput, { color: colors.text }]}
                />
              </RowCard>

              {/* 3) Followers */}
              <RowCard
                label="Followers"
                colors={colors}
                right={
                  followersText ? (
                    <ThemedText style={{ color: colors.textSecondary }}>
                      {formatCount(Number(followersText))}
                    </ThemedText>
                  ) : (
                    <ThemedText style={{ color: colors.textSecondary, opacity: 0.4 }}>0</ThemedText>
                  )
                }
              >
                <TextInput
                  value={followersText}
                  onChangeText={(v) => {
                    const next = digitsOnly(v);
                    setFollowersText(next);

                    const f = Number(next || "0") || 0;
                    const g = Number(digitsOnly(followingText)) || 0;
                    if (f > 0 && g >= f) setFollowingText(String(Math.max(0, f - 1)));
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  style={[styles.rowInput, { color: colors.text }]}
                />
              </RowCard>

              {/* iOS picker shown INLINE here so it’s ABOVE the Joined row, and it doesn't close on wheel changes */}
              {Platform.OS === "ios" && showJoinedPicker ? (
                <View style={[styles.pickerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={styles.pickerHeader}>
                    <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>
                      Pick joined date
                    </ThemedText>

                    <Pressable
                      onPress={() => setShowJoinedPicker(false)}
                      hitSlop={10}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                      <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>Done</ThemedText>
                    </Pressable>
                  </View>

                  <DateTimePicker
                    value={joinedDate}
                    mode="date"
                    display="spinner"
                    onChange={(_, selected) => {
                      // keep open on iOS; just update the value
                      if (selected) setJoinedDate(selected);
                    }}
                    style={{ alignSelf: "stretch" }}
                  />
                </View>
              ) : null}

              {/* 4) JoinedDate */}
              <RowCard
                label="Joined date"
                colors={colors}
                right={
                  <Pressable
                    onPress={() => setShowJoinedPicker((v) => !v)}
                    hitSlop={10}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>
                      {joinedDate.toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </ThemedText>
                  </Pressable>
                }
              >
                <ThemedText style={{ color: colors.textSecondary }}>Tap the date to change it</ThemedText>
              </RowCard>

              {/* Android date picker (dialog). It will open from here and close after selection. */}
              {Platform.OS === "android" && showJoinedPicker ? (
                <DateTimePicker
                  value={joinedDate}
                  mode="date"
                  display="default"
                  onChange={(_, selected) => {
                    // Android uses a dialog; close after picking (or cancel)
                    setShowJoinedPicker(false);
                    if (selected) setJoinedDate(selected);
                  }}
                />
              ) : null}

              {/* 5) Location */}
              <RowCard label="Location" colors={colors}>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="e.g. paris, france"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.rowInput, { color: colors.text }]}
                />
              </RowCard>

              {/* 6) Link */}
              <RowCard label="Link" colors={colors}>
                <TextInput
                  value={link}
                  onChangeText={setLink}
                  placeholder="e.g. https://..."
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  style={[styles.rowInput, { color: colors.text }]}
                />
              </RowCard>
            </View>
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

  avatarWrap: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
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

  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  cardLabel: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  rowInput: {
    fontSize: 16,
    paddingVertical: 0,
  },

  sizeBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },

  // iOS inline picker card (shows ABOVE JoinedDate row)
  pickerCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
  },
});
