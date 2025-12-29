// mobile/app/modal/create-scenario.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import type { Scenario } from "@/data/db/schema";
import { RowCard } from "@/components/ui/RowCard";

import {
  sanitizeTagInput,
  tagKeyFromInput,
  tagNameFromKey,
  colorForTagKey,
} from "@/lib/tags";

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

type ScenarioTagUI = {
  key: string;
  name: string;
  color: string;
};

export default function CreateScenarioModal() {
  const { scenarioId } = useLocalSearchParams<Params>();
  const isEdit = Boolean(scenarioId);

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const { isReady, getScenarioById, upsertScenario } = useAppData() as any;

  const existing: Scenario | null = useMemo(() => {
    if (!isEdit) return null;
    return getScenarioById?.(String(scenarioId)) ?? null;
  }, [isEdit, scenarioId, getScenarioById]);

  const isOwner = useMemo(() => {
    if (!existing) return true;
    return String(existing.ownerUserId) === String(userId ?? "");
  }, [existing, userId]);

  const canEdit = !isEdit || isOwner;

  // form state
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState(existing?.cover ?? "");

  // inviteCode: read-only, but can regenerate via button (create-mode)
  const [inviteCode, setInviteCode] = useState<string>(() => {
    const existingCode = String(existing?.inviteCode ?? "").trim();
    if (existingCode) return existingCode;
    return generateInviteCode();
  });

  const [tags, setTags] = useState<ScenarioTagUI[]>(() => {
    const raw = (existing as any)?.tags;
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
  });

  // tag input
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<TextInput>(null);

  const addTag = useCallback(() => {
    if (!canEdit) return;

    const cleaned = sanitizeTagInput(tagInput);
    if (!cleaned) return;

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
  }, [canEdit, isEdit]);

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
      Alert.alert("Missing cover", "Cover URL is required for now.");
      return false;
    }

    const code = String(inviteCode).trim();
    if (!code) {
      Alert.alert("Missing invite code", "Invite code is missing (unexpected).");
      return false;
    }

    return true;
  }, [userId, isEdit, isOwner, name, cover, inviteCode]);

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

    const next: Scenario = {
      ...base,
      name: String(name).trim().slice(0, SCENARIO_LIMITS.MAX_NAME),
      description:
        String(description).trim().slice(0, SCENARIO_LIMITS.MAX_DESCRIPTION) || undefined,
      cover: String(cover).trim(),
      inviteCode: String(inviteCode).trim(), // set only by generator
      updatedAt: now,
      tags: tags.map((t) => ({
        id: `t_${t.key}`,
        key: t.key,
        name: t.name,
        color: t.color,
      })) as any,
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
  ]);

  const headerTitle = isEdit ? "Edit scenario" : "Create scenario";

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

            <ThemedText type="defaultSemiBold">{headerTitle}</ThemedText>

            <Pressable
              onPress={onSave}
              disabled={!canEdit}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: !canEdit ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={{ color: canEdit ? colors.tint : colors.textMuted, fontWeight: "800" }}>
                {isEdit ? "Save" : "Create"}
              </ThemedText>
            </Pressable>
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

            <RowCard label={`Description (${description.length}/${SCENARIO_LIMITS.MAX_DESCRIPTION})`} colors={colors}>
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

            <RowCard label="Cover URL" colors={colors}>
              <TextInput
                value={cover}
                onChangeText={setCover}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text }]}
                editable={canEdit}
              />
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
                      onChangeText={setTagInput}
                      placeholder="letters / numbers / spaces (e.g. romcom)"
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
                    Add tags to the scenario.
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
});