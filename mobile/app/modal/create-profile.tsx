// mobile/app/modal/create-profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Modal,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import { Avatar } from "@/components/ui/Avatar";
import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";

import type { Profile } from "@/data/db/schema";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHandle(input: string) {
  // storage is without "@"
  return String(input ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function toOptionalInt(v: string, max = 99_000_000_000) {
  const digits = String(v ?? "").replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

function normalizeLink(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CreateProfileModal() {
  const { scenarioId, profileId } = useLocalSearchParams<{
    scenarioId: string;
    profileId?: string;
  }>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = String(scenarioId ?? "");
  const isEdit = !!profileId;
  const pid = isEdit ? String(profileId) : "";

  const { userId } = useAuth();
  const { isReady, getProfileById, upsertProfile, setSelectedProfileId } = useAppData();

  const DEFAULT_AVATAR = "https://i.pravatar.cc/150?img=14";

  const LIMITS = {
    displayName: 50,
    handle: 30,
    bio: 160,
    location: 30,
    link: 120,
  } as const;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(DEFAULT_AVATAR);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");

  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");

  const [joinedDate, setJoinedDate] = useState<Date | null>(null);
  const [showJoinedPicker, setShowJoinedPicker] = useState(false);

  const [following, setFollowing] = useState("");
  const [followers, setFollowers] = useState("");

  /* ---------------------------------------------------------------------- */
  /* Hydrate edit mode                                                      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!isReady || !isEdit || !pid) return;

    const existing = getProfileById(pid);
    if (!existing) return;

    setName(existing.displayName || "");
    setHandle(existing.handle || "");
    setBio(existing.bio || "");
    setLocation(existing.location || "");
    setLink(existing.link || "");

    setJoinedDate(existing.joinedDate ? new Date(existing.joinedDate) : null);
    setFollowing(existing.followingCount != null ? String(existing.followingCount) : "");
    setFollowers(existing.followerCount != null ? String(existing.followerCount) : "");
    setAvatarUrl(existing.avatarUrl || DEFAULT_AVATAR);
  }, [isReady, isEdit, pid, getProfileById]);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && normalizeHandle(handle).length > 0,
    [name, handle]
  );

  /* ---------------------------------------------------------------------- */
  /* Avatar                                                                 */
  /* ---------------------------------------------------------------------- */

  const onPickAvatar = async () => {
    const uri = await pickAndPersistOneImage({
      persistAs: "avatar",
      allowsEditing: true,
      quality: 0.9,
    });
    if (!uri) return;
    setAvatarUrl(uri);
  };

  /* ---------------------------------------------------------------------- */
  /* Save                                                                   */
  /* ---------------------------------------------------------------------- */

  const onSave = async () => {
    const payload: Profile = {
      id: isEdit && pid ? pid : makeId("pr"),
      scenarioId: sid,
      ownerUserId: String(userId ?? "u14"),
      displayName: name.trim(),
      handle: normalizeHandle(handle),
      avatarUrl: avatarUrl || DEFAULT_AVATAR,
      bio: bio.trim() || undefined,
      location: location.trim() || undefined,
      link: normalizeLink(link),
      joinedDate: joinedDate ? joinedDate.toISOString().slice(0, 10) : undefined,
      followingCount: toOptionalInt(following),
      followerCount: toOptionalInt(followers),
    };

    await upsertProfile(payload);
    await setSelectedProfileId(sid, payload.id);
    router.back();
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          Keyboard.dismiss();
          setShowJoinedPicker(false);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
              {isEdit ? "Edit profile" : "Create profile"}
            </ThemedText>

            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>Cancel</ThemedText>
            </Pressable>
          </View>

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Pressable onPress={onPickAvatar} hitSlop={12} style={styles.avatarBtn}>
              <Avatar uri={avatarUrl} size={96} fallbackColor={colors.border} />
              <View
                style={[
                  styles.avatarOverlay,
                  { backgroundColor: colors.tint, borderColor: colors.background },
                ]}
              >
                <ThemedText style={styles.avatarPlus}>＋</ThemedText>
              </View>
            </Pressable>

            <ThemedText style={[styles.avatarHint, { color: colors.textSecondary }]}>
              Add profile photo
            </ThemedText>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            <View style={styles.form}>
              <Input label="Display name" value={name} onChangeText={setName} colors={colors} />
              <Input
                label="Handle"
                value={handle}
                onChangeText={setHandle}
                colors={colors}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Input label="Bio (optional)" value={bio} onChangeText={setBio} colors={colors} multiline />
              <Input
                label="Location (optional)"
                value={location}
                onChangeText={setLocation}
                colors={colors}
              />
              <Input
                label="Link (optional)"
                value={link}
                onChangeText={setLink}
                colors={colors}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowJoinedPicker(true);
                }}
                style={({ pressed }) => [
                  styles.inputWrap,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
                ]}
              >
                <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>Joined date</ThemedText>
                <ThemedText style={{ fontSize: 16, color: colors.text }}>
                  {(joinedDate ?? new Date()).toLocaleDateString()}
                </ThemedText>
              </Pressable>

              <View style={styles.row2}>
                <Input
                  label="Following (optional)"
                  value={following}
                  onChangeText={setFollowing}
                  colors={colors}
                  keyboardType="number-pad"
                />
                <Input
                  label="Followers (optional)"
                  value={followers}
                  onChangeText={setFollowers}
                  colors={colors}
                  keyboardType="number-pad"
                />
              </View>

              <Pressable
                disabled={!canSubmit}
                onPress={onSave}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.text, opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1 },
                ]}
              >
                <ThemedText style={{ color: colors.background, fontWeight: "700" }}>
                  {isEdit ? "Save" : "Create"}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>

          {/* Joined date picker */}
          <Modal visible={showJoinedPicker} transparent animationType="fade">
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowJoinedPicker(false)}>
              <Pressable
                style={[
                  styles.pickerModalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <DateTimePicker
                  value={joinedDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    if (date) setJoinedDate(date);
                    if (Platform.OS !== "ios") setShowJoinedPicker(false);
                  }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Input                                                                     */
/* -------------------------------------------------------------------------- */

function Input(props: any) {
  const { label, colors, ...rest } = props;
  return (
    <View style={[styles.inputWrap, { borderColor: colors.border }]}>
      <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>{label}</ThemedText>
      <TextInput {...rest} style={[styles.input, { color: colors.text }]} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  form: {
    padding: 16,
    gap: 14,
  },

  row2: {
    flexDirection: "row",
    gap: 12,
  },

  inputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  input: {
    fontSize: 16,
    paddingVertical: 2,
  },

  primaryBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    alignItems: "center",
  },

  avatarBtn: {
    position: "relative",
  },

  avatarOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  avatarPlus: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  avatarHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.9,
  },

  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },

  pickerModalCard: {
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
});
