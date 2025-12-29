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
import { Stack, router, useLocalSearchParams } from "expo-router";
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

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type ScenarioTagUI = {
  key: string;   // canonical
  name: string;  // generated
  color: string; // deterministic, locked
};

export default function CreateScenarioModal() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { scenarioId } = useLocalSearchParams<{ scenarioId?: string }>();
  const isEdit = !!scenarioId;

  const { userId } = useAuth();
  const { getScenarioById, upsertScenario } = useAppData() as any;

  const existing: Scenario | null = useMemo(() => {
    if (!isEdit) return null;
    const s = getScenarioById?.(String(scenarioId));
    return s ? (s as Scenario) : null;
  }, [getScenarioById, isEdit, scenarioId]);

  const isOwner = useMemo(() => {
    if (!existing) return true; // creating => current user is owner
    return String(existing.ownerUserId) === String(userId);
  }, [existing, userId]);

  const [name, setName] = useState<string>(existing?.name ?? "");
  const [description, setDescription] = useState<string>(existing?.description ?? "");
  const [cover, setCover] = useState<string>(existing?.cover ?? "");
  const [inviteCode, setInviteCode] = useState<string>(existing?.inviteCode ?? "");

  // hydrate tags from existing (supports older shapes)
  const [tags, setTags] = useState<ScenarioTagUI[]>(() => {
    const raw = (existing as any)?.tags;
    if (!Array.isArray(raw)) return [];

    const list: ScenarioTagUI[] = raw
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

    // dedupe by key
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

  const onClose = () => router.back();

  const addTag = useCallback(() => {
    const cleaned = sanitizeTagInput(tagInput);
    if (!cleaned) return;

    const key = tagKeyFromInput(cleaned);
    if (!key) return;

    const nextTag: ScenarioTagUI = {
      key,
      name: tagNameFromKey(key),  // always generated
      color: colorForTagKey(key), // always locked
    };

    setTags((prev) => {
      const exists = prev.some((t) => t.key === key);
      if (exists) return prev;
      return [...prev, nextTag];
    });

    setTagInput("");

    // keep focus to avoid "submit" side effects / keyboard flicker
    requestAnimationFrame(() => tagInputRef.current?.focus());
  }, [tagInput]);

  const removeTag = useCallback((key: string) => {
    setTags((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const validate = useCallback(() => {
    if (!userId) {
      Alert.alert("Not signed in", "You need to be signed in to create a scenario.");
      return false;
    }
    if (isEdit && !isOwner) {
      Alert.alert("Not allowed", "Only the scenario owner can edit this scenario.");
      return false;
    }
    if (!String(name).trim()) {
      Alert.alert("Missing name", "Scenario name is required.");
      return false;
    }
    if (!String(cover).trim()) {
      Alert.alert("Missing cover", "Cover URL is required for now.");
      return false;
    }
    if (!String(inviteCode).trim()) {
      Alert.alert("Missing invite code", "Invite code is required.");
      return false;
    }
    return true;
  }, [userId, isEdit, isOwner, name, cover, inviteCode]);

  const onSave = useCallback(async () => {
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
      name: String(name).trim(),
      description: String(description).trim() || undefined,
      cover: String(cover).trim(),
      inviteCode: String(inviteCode).trim(),
      updatedAt: now,

      // store tags as key+name+color (id stable from key)
      tags: tags.map((t) => ({
        id: `t_${t.key}`, // stable id
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
  }, [validate, existing, userId, name, description, cover, inviteCode, tags, upsertScenario]);

  const headerTitle = isEdit ? "Edit scenario" : "Create scenario";

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "modal",
          headerTitle,
          headerLeft: () => (
            <Pressable onPress={onClose} hitSlop={10} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <ThemedText style={{ color: colors.textSecondary, fontWeight: "700" }}>Cancel</ThemedText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} hitSlop={10} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                {isEdit ? "Save" : "Create"}
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <RowCard label="Name" colors={colors}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Scenario name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
                editable={!isEdit || isOwner}
              />
            </RowCard>

            <RowCard label="Description" colors={colors}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Short pitch / vibe"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, styles.inputMultiline, { color: colors.text }]}
                editable={!isEdit || isOwner}
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
                editable={!isEdit || isOwner}
              />
            </RowCard>

            <RowCard
              label="Invite code"
              colors={colors}
              right={
                <Pressable
                  onPress={() => {
                    if (!isOwner && isEdit) return;
                    if (inviteCode.trim()) return;
                    setInviteCode(Math.random().toString(36).slice(2, 10).toUpperCase());
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
                >
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "800", fontSize: 12 }}>
                    RANDOM
                  </ThemedText>
                </Pressable>
              }
            >
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. ROYAL2024"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                style={[styles.input, { color: colors.text, letterSpacing: 0.6 }]}
                editable={!isEdit || isOwner}
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
                      editable={!isEdit || isOwner}

                      // ✅ avoids weird navigation/remount behaviors
                      blurOnSubmit={false}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (isEdit && !isOwner) return;
                        addTag();
                        requestAnimationFrame(() => tagInputRef.current?.focus());
                      }}
                    />
                  </View>

                  <Pressable
                    onPress={addTag}
                    disabled={isEdit && !isOwner}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.addTagBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.pressed : colors.card,
                        opacity: isEdit && !isOwner ? 0.5 : 1,
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
                        style={[
                          styles.tagChip,
                          { borderColor: colors.border, backgroundColor: colors.card },
                        ]}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={[styles.colorDot, { backgroundColor: t.color }]} />
                          <ThemedText style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                            {t.name}
                          </ThemedText>
                        </View>

                        {(!isEdit || isOwner) && (
                          <Pressable
                            onPress={() => removeTag(t.key)}
                            hitSlop={8}
                            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                          >
                            <Ionicons name="close" size={16} color={colors.textSecondary} />
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Add tags like Notion. Casing doesn’t matter (ROMCOM → Romcom). Colors are locked.
                  </ThemedText>
                )}
              </View>
            </RowCard>

            <View style={{ paddingHorizontal: 2, paddingTop: 4 }}>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                owner: {existing?.ownerUserId ?? userId ?? "—"}
              </ThemedText>
            </View>

            {isEdit && !isOwner ? (
              <View style={{ paddingHorizontal: 2, paddingTop: 2 }}>
                <ThemedText style={{ color: colors.textMuted, fontSize: 12 }}>
                  You can view details, but only the owner can edit.
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 30 },

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