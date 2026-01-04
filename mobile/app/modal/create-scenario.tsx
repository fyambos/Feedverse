// mobile/app/modal/create-scenario.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";
import { Alert } from "@/context/dialog";

import type { Scenario, Profile } from "@/data/db/schema";
import { RowCard } from "@/components/ui/RowCard";

import {
  sanitizeTagInput,
  tagKeyFromInput,
  tagNameFromKey,
  colorForTagKey,
} from "@/lib/tags";

import { pickAndPersistOneImage } from "@/components/ui/ImagePicker";
import { MAX_OWNED_PROFILES_PER_USER, MAX_TOTAL_PROFILES_PER_SCENARIO } from "@/lib/rules";

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

const SCENARIO_LIMITS = {
  MAX_NAME: 60,
  MAX_DESCRIPTION: 220,
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type Params = { scenarioId?: string };

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 8 chars, uppercase
function generateInviteCode() {
  const raw = Math.random().toString(36).slice(2, 10).toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, "A").slice(0, 8);
}

// tags: letters/numbers/spaces only (no special chars)
function isValidTagInput(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  return /^[a-zA-Z0-9 ]+$/.test(s);
}

type ScenarioTagUI = {
  key: string;
  name: string;
  color: string;
};

function buildTagsUI(existing: any): ScenarioTagUI[] {
  const raw = existing?.tags;
  if (!Array.isArray(raw)) return [];

  const list = raw
    .map((t: any) => {
      const rawInput = String(t?.key ?? t?.name ?? t?.id ?? "");
      const key = tagKeyFromInput(rawInput);
      if (!key) return null;
      return {
        key,
        name: tagNameFromKey(key),
        color: colorForTagKey(key),
      };
    })
    .filter(Boolean) as ScenarioTagUI[];

  const seen = new Set<string>();
  return list.filter((t) => {
    if (seen.has(t.key)) return false;
    seen.add(t.key);
    return true;
  });
}

type ProfileLimitMode = "per_owner" | "per_scenario";
const PROFILE_LIMIT_LABEL: Record<ProfileLimitMode, string> = {
  per_owner: `Per player (${MAX_OWNED_PROFILES_PER_USER} max)`,
  per_scenario: `Per scenario (${MAX_TOTAL_PROFILES_PER_SCENARIO} total)`,
};

export default function CreateScenarioModal() {
  const { scenarioId } = useLocalSearchParams<Params>();
  const isEdit = Boolean(scenarioId);

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const {
    isReady,
    getScenarioById,
    upsertScenario,
    setScenarioMode,
    listProfilesForScenario,
  } = useAppData() as any;

  const existing: Scenario | null = useMemo(() => {
    if (!isEdit) return null;
    return getScenarioById?.(String(scenarioId)) ?? null;
  }, [isEdit, scenarioId, getScenarioById]);

  const isOwner = useMemo(() => {
    if (!existing) return true;
    return String((existing as any).ownerUserId) === String(userId ?? "");
  }, [existing, userId]);

  // canEdit means: all fields/actions are editable
  const canEdit = !isEdit || isOwner;

  // form state
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [mode, setMode] = useState<"story" | "campaign">(
    (existing as any)?.mode === "campaign" ? "campaign" : "story"
  );

  // scenario setting: profileLimitMode (stored in scenario.settings)
  const [profileLimitMode, setProfileLimitMode] = useState<ProfileLimitMode>(() => {
    const m = (existing as any)?.settings?.profileLimitMode;
    return m === "per_scenario" ? "per_scenario" : "per_owner";
  });

  // cover: picked image uri
  const [cover, setCover] = useState<string>(String(existing?.cover ?? "").trim());
  const [pickingCover, setPickingCover] = useState(false);

  const [inviteCode, setInviteCode] = useState<string>(() => {
    const existingCode = String(existing?.inviteCode ?? "").trim();
    if (existingCode) return existingCode;
    return generateInviteCode();
  });

  const [tags, setTags] = useState<ScenarioTagUI[]>(() => buildTagsUI(existing));

  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<TextInput>(null);

  // hydrate state when editing + scenario becomes available (or changes)
  useEffect(() => {
    if (!isEdit) return;
    if (!existing) return;

    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setMode((existing as any)?.mode === "campaign" ? "campaign" : "story");
    setCover(String(existing?.cover ?? "").trim());

    const existingCode = String(existing?.inviteCode ?? "").trim();
    setInviteCode(existingCode || generateInviteCode());

    setTags(buildTagsUI(existing));

    // hydrate setting from scenario.settings
    const m = (existing as any)?.settings?.profileLimitMode;
    setProfileLimitMode(m === "per_scenario" ? "per_scenario" : "per_owner");
  }, [isEdit, existing]);

  // determine if we can switch back to per_owner (only relevant when editing)
  const canSwitchBackToPerOwner = useMemo(() => {
    if (!existing?.id) return true; // creating scenario => always ok
    const sid = String(existing.id);
    const profiles: Profile[] = (listProfilesForScenario?.(sid) ?? []) as any;

    const counts = new Map<string, number>(); // ownerUserId -> count
    for (const p of profiles) {
      const uid = String((p as any)?.ownerUserId ?? "").trim();
      if (!uid) continue;
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    }

    for (const n of counts.values()) {
      if (n > MAX_OWNED_PROFILES_PER_USER) return false;
    }
    return true;
  }, [existing?.id, listProfilesForScenario]);

  const pickProfileLimitMode = useCallback(() => {
    if (!canEdit) return;

    Alert.alert("Profile limits", "Choose how limits work in this scenario:", [
      {
        text: PROFILE_LIMIT_LABEL.per_scenario,
        onPress: () => setProfileLimitMode("per_scenario"),
      },
      {
        text: PROFILE_LIMIT_LABEL.per_owner,
        onPress: () => {
          if (!canSwitchBackToPerOwner) {
            Alert.alert(
              "Cannot switch back",
              `Someone in this scenario has more than ${MAX_OWNED_PROFILES_PER_USER} owned profiles.\n\nReduce their profiles first, then you can use “Per player”.`
            );
            return;
          }
          setProfileLimitMode("per_owner");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [canEdit, canSwitchBackToPerOwner]);

  const pickCover = useCallback(async () => {
    if (!canEdit) return;

    setPickingCover(true);
    try {
      const uri = await pickAndPersistOneImage({
        persistAs: "header",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (uri) setCover(uri);
    } finally {
      setPickingCover(false);
    }
  }, [canEdit]);

  const addTag = useCallback(() => {
    if (!canEdit) return;

    const cleaned = sanitizeTagInput(tagInput);
    if (!cleaned) return;

    if (!isValidTagInput(cleaned)) {
      Alert.alert("Invalid tag", "Tags can only contain letters, numbers and spaces.");
      return;
    }

    const key = tagKeyFromInput(cleaned);
    if (!key) return;

    const nextTag: ScenarioTagUI = {
      key,
      name: tagNameFromKey(key),
      color: colorForTagKey(key),
    };

    setTags((prev) => {
      if (prev.some((t) => t.key === key)) return prev;
      return [...prev, nextTag];
    });

    setTagInput("");
    requestAnimationFrame(() => tagInputRef.current?.focus());
  }, [canEdit, tagInput]);

  const removeTag = useCallback(
    (key: string) => {
      if (!canEdit) return;
      setTags((prev) => prev.filter((t) => t.key !== key));
    },
    [canEdit]
  );

  // regenerate invite code (button-only mutation)
  const regenerateInviteCode = useCallback(() => {
    if (!canEdit) return;
    setInviteCode(generateInviteCode());
  }, [canEdit]);

  const validate = useCallback(() => {
    if (!userId) {
      Alert.alert("Not signed in", "You need to be signed in to create a scenario.");
      return false;
    }
    if (isEdit && !isOwner) {
      Alert.alert("Not allowed", "Only the scenario owner can edit this scenario.");
      return false;
    }

    const safeName = String(name).trim();
    if (!safeName) {
      Alert.alert("Missing name", "Scenario name is required.");
      return false;
    }

    const safeCover = String(cover).trim();
    if (!safeCover) {
      Alert.alert("Missing cover", "Pick a cover image.");
      return false;
    }

    const code = String(inviteCode).trim();
    if (!code) {
      Alert.alert("Missing invite code", "Invite code is missing (unexpected).");
      return false;
    }

    for (const t of tags) {
      if (!isValidTagInput(t.name)) {
        Alert.alert("Invalid tags", "One of the tags contains invalid characters.");
        return false;
      }
    }

    // safety: don't allow saving per_owner if it would break limits
    if (isEdit && existing?.id && profileLimitMode === "per_owner" && !canSwitchBackToPerOwner) {
      Alert.alert(
        "Cannot save this setting",
        `Someone in this scenario has more than ${MAX_OWNED_PROFILES_PER_USER} owned profiles.\n\nKeep “Per scenario” or reduce profiles first.`
      );
      return false;
    }

    return true;
  }, [
    userId,
    isEdit,
    isOwner,
    name,
    cover,
    inviteCode,
    tags,
    profileLimitMode,
    canSwitchBackToPerOwner,
    existing?.id,
  ]);

  const onSave = useCallback(async () => {
    if (!isReady) return;
    if (!validate()) return;

    const now = new Date().toISOString();

    const base: Scenario = existing
      ? existing
      : ({
          id: makeId("sc"),
          createdAt: now,
          playerIds: [String(userId)],
          ownerUserId: String(userId),
        } as any);

    const prevSettings = (existing as any)?.settings ?? {};
    const nextSettings = {
      ...(prevSettings ?? {}),
      profileLimitMode, 
    };

    const next: Scenario = {
      ...base,
      name: String(name).trim().slice(0, SCENARIO_LIMITS.MAX_NAME),
      description:
        String(description).trim().slice(0, SCENARIO_LIMITS.MAX_DESCRIPTION) || undefined,
      cover: String(cover).trim(),
      inviteCode: String(inviteCode).trim(),
      updatedAt: now,
      tags: tags.map((t) => ({
        id: `t_${t.key}`,
        key: t.key,
        name: t.name,
        color: t.color,
      })) as any,
      mode,
      settings: nextSettings, 
      
      gmUserIds: Array.from(
        new Set([
          String(userId),
          ...((existing as any)?.gmUserIds ? (existing as any).gmUserIds.map(String) : []),
        ])
      ),
    };

    try {
      await upsertScenario(next);
      router.back();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save scenario.");
    }
  }, [
    isReady,
    validate,
    existing,
    userId,
    name,
    description,
    cover,
    inviteCode,
    tags,
    upsertScenario,
    mode,
    profileLimitMode,
  ]);

  const headerTitle = isEdit ? (isOwner ? "Edit scenario" : "Scenario details") : "Create scenario";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        {pickingCover ? (
          <View style={styles.overlay} pointerEvents="auto">
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

            <ThemedText type="defaultSemiBold">{headerTitle}</ThemedText>

            {canEdit ? (
              <Pressable
                onPress={onSave}
                hitSlop={12}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>
                  {isEdit ? "Save" : "Create"}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            <RowCard label={`Name (${name.length}/${SCENARIO_LIMITS.MAX_NAME})`} colors={colors}>
              <TextInput
                value={name}
                onChangeText={(v) => setName(v.slice(0, SCENARIO_LIMITS.MAX_NAME))}
                placeholder="Scenario name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
                editable={canEdit}
              />
            </RowCard>

            <RowCard
              label={`Description (${description.length}/${SCENARIO_LIMITS.MAX_DESCRIPTION})`}
              colors={colors}
            >
              <TextInput
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, SCENARIO_LIMITS.MAX_DESCRIPTION))}
                placeholder="Short pitch / vibe"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, styles.inputMultiline, { color: colors.text }]}
                editable={canEdit}
              />
            </RowCard>

            {/* Profile limit mode */}
            <RowCard
              label="Profile limits"
              colors={colors}
              right={<Ionicons name="chevron-forward" size={18} color={colors.icon} />}
            >
              <Pressable
                onPress={pickProfileLimitMode}
                hitSlop={10}
                disabled={!canEdit}
                style={({ pressed }) => [{ opacity: !canEdit ? 0.5 : pressed ? 0.75 : 1 }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                  {PROFILE_LIMIT_LABEL[profileLimitMode]}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {profileLimitMode === "per_scenario"
                    ? "Total profiles are capped for the whole scenario (players can have uneven counts)."
                    : "Each player is capped individually (fair distribution)."}
                </ThemedText>

                {isEdit && profileLimitMode === "per_scenario" && !canSwitchBackToPerOwner ? (
                  <ThemedText style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                    Can’t switch back to “Per player” while someone exceeds {MAX_OWNED_PROFILES_PER_USER}.
                  </ThemedText>
                ) : null}
              </Pressable>
            </RowCard>

            {/* Mode (story vs. campaign) */}
            <RowCard label="Mode" colors={colors} right={null}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                    {mode === "campaign" ? "Campaign" : "Story"}
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {mode === "campaign"
                      ? "Enables character sheets, rolls, pinned posts, logs, quests, combat."
                      : "Freeform narration (classic posts)."}
                  </ThemedText>
                </View>

                <Switch
                  value={mode === "campaign"}
                  onValueChange={async (v) => {
                    if (!canEdit) return;

                    const nextMode: "story" | "campaign" = v ? "campaign" : "story";
                    setMode(nextMode);

                    // If editing an existing scenario, persist immediately
                    if (isEdit && existing?.id) {
                      try {
                        await setScenarioMode?.(String(existing.id), nextMode);
                      } catch (e: any) {
                        Alert.alert("Update failed", e?.message ?? "Could not update scenario mode.");
                      }
                    }
                  }}
                  trackColor={{ false: colors.border, true: colors.tint }}
                  thumbColor={colors.card}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </RowCard>

            {/* Cover (image picker + preview) */}
            <RowCard
              label="Cover"
              colors={colors}
              right={
                canEdit ? (
                  <Pressable
                    onPress={pickCover}
                    hitSlop={10}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: "800", fontSize: 12 }}>
                      {cover ? "CHANGE" : "PICK"}
                    </ThemedText>
                  </Pressable>
                ) : null
              }
            >
              <Pressable
                onPress={pickCover}
                disabled={!canEdit}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.coverPressable,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    opacity: !canEdit ? 0.6 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                {cover ? (
                  <>
                    <Image source={{ uri: cover }} style={styles.coverImage} contentFit="cover" transition={150} />
                    <View style={styles.coverOverlay}>
                      <View style={[styles.coverBadge, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                        <Ionicons name="image-outline" size={16} color="#fff" />
                        <ThemedText style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>
                          tap to change
                        </ThemedText>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.coverEmpty}>
                    <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
                    <ThemedText style={{ color: colors.textSecondary, fontWeight: "700" }}>
                      Pick a cover image (16:9)
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            </RowCard>

            {/* Invite code (read-only, regen by button) */}
            <RowCard
              label="Invite code"
              colors={colors}
              right={
                <Pressable
                  onPress={regenerateInviteCode}
                  hitSlop={8}
                  disabled={!canEdit}
                  style={({ pressed }) => [{ opacity: !canEdit ? 0.4 : pressed ? 0.65 : 1 }]}
                >
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "800", fontSize: 12 }}>
                    GENERATE
                  </ThemedText>
                </Pressable>
              }
            >
              <TextInput
                value={inviteCode}
                editable={false}
                selectTextOnFocus
                style={[
                  styles.input,
                  {
                    color: colors.textMuted,
                    letterSpacing: 0.8,
                    opacity: 0.85,
                  },
                ]}
              />
            </RowCard>

            <RowCard label="Tags" colors={colors}>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      ref={tagInputRef}
                      value={tagInput}
                      onChangeText={(v) => {
                        const next = v.replace(/[^a-zA-Z0-9 ]+/g, "");
                        setTagInput(next);
                      }}
                      placeholder="(e.g. adventure)"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.text }]}
                      autoCapitalize="none"
                      editable={canEdit}
                      blurOnSubmit={false}
                      returnKeyType="done"
                      onSubmitEditing={addTag}
                    />
                  </View>

                  <Pressable
                    onPress={addTag}
                    disabled={!canEdit}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.addTagBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.pressed : colors.card,
                        opacity: canEdit ? 1 : 0.5,
                      },
                    ]}
                  >
                    <Ionicons name="add" size={18} color={colors.icon} />
                  </Pressable>
                </View>

                {tags.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {tags.map((t) => (
                      <View
                        key={t.key}
                        style={[styles.tagChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={[styles.colorDot, { backgroundColor: t.color }]} />
                          <ThemedText style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                            {t.name}
                          </ThemedText>
                        </View>

                        {canEdit ? (
                          <Pressable
                            onPress={() => removeTag(t.key)}
                            hitSlop={8}
                            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                          >
                            <Ionicons name="close" size={16} color={colors.textSecondary} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Add tags to the scenario (letters/numbers/spaces only).
                  </ThemedText>
                )}
              </View>
            </RowCard>

            <View style={{ paddingHorizontal: 2, paddingTop: 2 }}>
              {isEdit && !isOwner ? (
                <ThemedText style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  You can view details, but only the owner can edit.
                </ThemedText>
              ) : null}
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

  content: { padding: 16, gap: 12, paddingBottom: 28 },

  input: {
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  inputMultiline: {
    minHeight: 66,
    textAlignVertical: "top",
  },

  coverPressable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
    height: 140, // preview height
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 10,
  },
  coverBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coverEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  addTagBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  tagChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
});