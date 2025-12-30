// mobile/app/modal/edit-sheet.tsx

import React, { useCallback, useMemo, useState } from "react";
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
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import type { CharacterSheet } from "@/data/db/schema";
import { RowCard } from "@/components/ui/RowCard";

type Params = { scenarioId: string; profileId: string; mode?: "edit" | "create" };

type FieldKey =
  | "identity"
  | "background"
  | "publicNotes"
  | "privateNotes"
  | "abilities"
  | "spells"
  | "stats"
  | "hp"
  | "status"
  | "inventory"
  | "equipment";

function clampInt(raw: string, fallback: number) {
  const n = parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function readonlyHint(label: string) {
  return `${label} is updated each turn by the GM.`;
}

export default function EditSheetModal() {
  const { scenarioId, profileId, mode } = useLocalSearchParams<Params>();

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const pid = decodeURIComponent(String(profileId ?? ""));
  const screenMode: "edit" | "create" = (mode === "create" ? "create" : "edit") as any;

  const { userId } = useAuth();
  const {
    isReady,
    getScenarioById,
    getProfileById,
    getCharacterSheetByProfileId,
    upsertCharacterSheet,
  } = useAppData() as any;

  const scenario = useMemo(() => getScenarioById?.(sid) ?? null, [sid, getScenarioById]);
  const profile = useMemo(() => getProfileById?.(pid) ?? null, [pid, getProfileById]);
  const sheet: CharacterSheet | null = useMemo(
    () => getCharacterSheetByProfileId?.(pid) ?? null,
    [pid, getCharacterSheetByProfileId]
  );

  const isOwner = useMemo(() => {
    if (!profile || !userId) return false;
    return String((profile as any).ownerUserId ?? "") === String(userId);
  }, [profile, userId]);

  const isGm = useMemo(() => {
    if (!scenario || !userId) return false;
    const gmIds: string[] = Array.isArray((scenario as any).gmUserIds)
      ? (scenario as any).gmUserIds.map(String)
      : [];
    return gmIds.includes(String(userId));
  }, [scenario, userId]);

  const isCreate = screenMode === "create";

  // Owner can edit some fields in EDIT mode.
  // In CREATE mode: everything editable (but warn it won't be later).
  const canEdit = useCallback(
    (field: FieldKey) => {
      if (isCreate) return true;
      if (isGm) return true;
      if (!isOwner) return false;

      // owner-editable fields in EDIT mode
      if (field === "identity") return true; // name/race/class/alignment (NOT level)
      if (field === "background") return true;
      if (field === "publicNotes") return true;
      if (field === "privateNotes") return true;
      if (field === "abilities") return true;
      if (field === "spells") return true;

      // NEW: inventory is editable by owner (manual items)
      if (field === "inventory") return true;
      if (field === "equipment") return true;

      // gm-only / turns-only
      return false;
    },
    [isCreate, isGm, isOwner]
  );

  // Level should only be editable by GM (or turns). Not by owner in EDIT mode.
  const canEditLevel = useMemo(() => (isCreate ? true : isGm), [isCreate, isGm]);
  const canSave = useMemo(() => {
    if (isCreate) return isGm || isOwner; // create allowed for owner/gm
    return isGm || isOwner; // edit allowed for owner/gm but fields restricted by canEdit()
  }, [isCreate, isGm, isOwner]);

  // ------------------------------
  // form state
  // ------------------------------
  const [name, setName] = useState(sheet?.name ?? "");
  const [race, setRace] = useState(sheet?.race ?? "");
  const [klass, setKlass] = useState((sheet as any)?.class ?? "");
  const [level, setLevel] = useState(String((sheet as any)?.level ?? ""));
  const [alignment, setAlignment] = useState(sheet?.alignment ?? "");

  const [background, setBackground] = useState(sheet?.background ?? "");

  const [publicNotes, setPublicNotes] = useState(sheet?.publicNotes ?? "");
  const [privateNotes, setPrivateNotes] = useState(sheet?.privateNotes ?? "");

  // abilities/spells as multi-line simple editor (one per line)
  const abilitiesText = useMemo(() => {
    const list = (sheet as any)?.abilities ?? [];
    if (!Array.isArray(list)) return "";
    return list.map((a: any) => (a?.notes ? `${a.name} — ${a.notes}` : `${a.name}`)).join("\n");
  }, [sheet]);
  const spellsText = useMemo(() => {
    const list = (sheet as any)?.spells ?? [];
    if (!Array.isArray(list)) return "";
    return list.map((s: any) => (s?.notes ? `${s.name} — ${s.notes}` : `${s.name}`)).join("\n");
  }, [sheet]);

  const [abilitiesRaw, setAbilitiesRaw] = useState(abilitiesText);
  const [spellsRaw, setSpellsRaw] = useState(spellsText);

  // GM-only fields (still visible read-only to owner in EDIT mode)
  const [str, setStr] = useState(String(sheet?.stats?.strength ?? ""));
  const [dex, setDex] = useState(String(sheet?.stats?.dexterity ?? ""));
  const [con, setCon] = useState(String(sheet?.stats?.constitution ?? ""));
  const [intell, setIntell] = useState(String(sheet?.stats?.intelligence ?? ""));
  const [wis, setWis] = useState(String(sheet?.stats?.wisdom ?? ""));
  const [cha, setCha] = useState(String(sheet?.stats?.charisma ?? ""));

  const [hpCur, setHpCur] = useState(String(sheet?.hp?.current ?? ""));
  const [hpMax, setHpMax] = useState(String(sheet?.hp?.max ?? ""));
  const [status, setStatus] = useState(String((sheet as any)?.status ?? ""));

  const inventoryText = useMemo(() => {
    const list = (sheet as any)?.inventory ?? [];
    if (!Array.isArray(list)) return "";
    return list
      .map((it: any) => {
        const qty = it?.qty ? `x${it.qty}` : "";
        const notes = it?.notes ? `(${it.notes})` : "";
        return [it?.name, qty, notes].filter(Boolean).join(" ").trim();
      })
      .filter(Boolean)
      .join("\n");
  }, [sheet]);

  const equipmentText = useMemo(() => {
    const list = (sheet as any)?.equipment ?? [];
    if (!Array.isArray(list)) return "";
    return list
      .map((it: any) => (it?.notes ? `${it.name} (${it.notes})` : `${it.name}`))
      .filter(Boolean)
      .join("\n");
  }, [sheet]);

  const [inventoryRaw, setInventoryRaw] = useState(inventoryText);
  const [equipmentRaw, setEquipmentRaw] = useState(equipmentText);

  // CREATE mode warning (show once when the modal opens)
  const [warnedCreate, setWarnedCreate] = useState(false);
  useMemo(() => {
    if (isCreate && !warnedCreate) {
      setWarnedCreate(true);
      Alert.alert(
        "Creating a Character Sheet",
        "Everything is editable right now. After creation, some fields will be auto-updated by turns and won’t be editable by the owner.",
        [{ text: "OK" }]
      );
    }
    return null;
  }, [isCreate, warnedCreate]);

  const parseNamedLines = (raw: string, prefix: string) => {
    const lines = String(raw ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((line, idx) => {
      // allow "Name — notes" OR "Name - notes"
      const sep = line.includes("—") ? "—" : line.includes(" - ") ? " - " : null;
      if (sep) {
        const [a, ...rest] = line.split(sep);
        return { id: `${prefix}_${idx}`, name: a.trim(), notes: rest.join(sep).trim() || undefined };
      }
      return { id: `${prefix}_${idx}`, name: line, notes: undefined };
    });
  };

  const onSave = useCallback(async () => {
    if (!isReady) return;

    // In CREATE mode, allow creating even if there was no sheet
    if (!sheet && !isCreate) {
      Alert.alert("No sheet", "This profile has no character sheet to edit.");
      return;
    }
    if (!canSave) {
      Alert.alert("Not allowed", "You can’t edit this character sheet.");
      return;
    }

    const base: CharacterSheet =
      sheet ??
      ({
        profileId: pid,
        name: String(name).trim() || "Unnamed",
      } as any);

    const next: CharacterSheet = {
      ...base,

      ...(canEdit("identity")
        ? {
            name: String(name).trim() || base.name,
            race: String(race).trim() || undefined,
            class: String(klass).trim() || undefined,
            alignment: String(alignment).trim() || undefined,
          }
        : {}),

      // Level special rule: editable only by GM in edit mode; editable in create mode.
      ...(canEditLevel
        ? {
            level: clampInt(level, (base as any)?.level ?? 1),
          }
        : {}),

      ...(canEdit("background") ? { background: String(background).trim() || undefined } : {}),

      ...(canEdit("publicNotes") ? { publicNotes: String(publicNotes).trim() || undefined } : {}),
      ...(canEdit("privateNotes") ? { privateNotes: String(privateNotes).trim() || undefined } : {}),

      // abilities should be editable (owner + gm in edit; everyone in create)
      ...(canEdit("abilities") ? { abilities: parseNamedLines(abilitiesRaw, "a") as any } : {}),
      ...(canEdit("spells") ? { spells: parseNamedLines(spellsRaw, "s") as any } : {}),

      // gm-only fields (in edit) but editable in create
      ...(canEdit("stats")
        ? {
            stats: {
              strength: clampInt(str, base.stats?.strength ?? 0),
              dexterity: clampInt(dex, base.stats?.dexterity ?? 0),
              constitution: clampInt(con, base.stats?.constitution ?? 0),
              intelligence: clampInt(intell, base.stats?.intelligence ?? 0),
              wisdom: clampInt(wis, base.stats?.wisdom ?? 0),
              charisma: clampInt(cha, base.stats?.charisma ?? 0),
            },
          }
        : {}),

      ...(canEdit("hp")
        ? {
            hp: {
              current: clampInt(hpCur, base.hp?.current ?? 0),
              max: clampInt(hpMax, base.hp?.max ?? 0),
            },
          }
        : {}),

      ...(canEdit("status") ? { status: String(status).trim() || undefined } : {}),

      // NEW: inventory should be editable by owner (and GM) in EDIT mode
      ...(canEdit("inventory")
        ? {
            inventory: parseNamedLines(inventoryRaw, "i").map((it: any) => ({
              id: it.id,
              name: it.name,
              notes: it.notes,
            })) as any,
          }
        : {}),

      ...(canEdit("equipment")
        ? {
            equipment: parseNamedLines(equipmentRaw, "e").map((it: any) => ({
              id: it.id,
              name: it.name,
              notes: it.notes,
            })) as any,
          }
        : {}),

      updatedAt: new Date().toISOString(),
    };

    try {
      await upsertCharacterSheet(next);
      router.back();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save character sheet.");
    }
  }, [
    isReady,
    sheet,
    isCreate,
    canSave,
    canEdit,
    canEditLevel,
    pid,
    name,
    race,
    klass,
    level,
    alignment,
    background,
    publicNotes,
    privateNotes,
    abilitiesRaw,
    spellsRaw,
    str,
    dex,
    con,
    intell,
    wis,
    cha,
    hpCur,
    hpMax,
    status,
    inventoryRaw,
    equipmentRaw,
    upsertCharacterSheet,
  ]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />

      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>

            <View style={{ flex: 1, alignItems: "center" }}>
              <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                {isCreate ? "Create Character Sheet" : "Edit Character Sheet"}
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {(profile as any)?.displayName ?? pid}
                {isGm ? " · GM" : isOwner ? " · Owner" : ""}
              </ThemedText>
            </View>

            <Pressable
              onPress={onSave}
              disabled={!canSave}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: !canSave ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={{ color: canSave ? colors.tint : colors.textMuted, fontWeight: "900" }}>
                Save
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
          >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {!sheet && !isCreate ? (
                <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>
                    No character sheet for this profile.
                  </ThemedText>
                </View>
              ) : (
                <>
                  {/* Identity */}
                  <RowCard label="Identity" colors={colors}>
                    <InputRow label="Name" value={name} onChangeText={setName} editable={canEdit("identity")} colors={colors} />
                    <InputRow label="Race" value={race} onChangeText={setRace} editable={canEdit("identity")} colors={colors} />
                    <InputRow label="Class" value={klass} onChangeText={setKlass} editable={canEdit("identity")} colors={colors} />

                    <InputRow
                      label="Level"
                      value={level}
                      onChangeText={setLevel}
                      editable={canEditLevel}
                      keyboardType="number-pad"
                      colors={colors}
                      helperText={!isCreate && !canEditLevel ? readonlyHint("Level") : undefined}
                    />

                    <InputRow
                      label="Alignment"
                      value={alignment}
                      onChangeText={setAlignment}
                      editable={canEdit("identity")}
                      colors={colors}
                    />
                  </RowCard>

                  {/* Background (private) */}
                  <RowCard label="Background (Private)" colors={colors}>
                    <TextInput
                      value={background}
                      onChangeText={setBackground}
                      editable={canEdit("background")}
                      placeholder={canEdit("background") ? "Background..." : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("background") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("background") ? 1 : 0.75,
                        },
                      ]}
                    />
                  </RowCard>

                  {/* Notes */}
                  <RowCard label="Notes" colors={colors}>
                    <ThemedText style={[styles.subLabel, { color: colors.textSecondary }]}>Public</ThemedText>
                    <TextInput
                      value={publicNotes}
                      onChangeText={setPublicNotes}
                      editable={canEdit("publicNotes")}
                      placeholder={canEdit("publicNotes") ? "Public notes..." : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("publicNotes") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("publicNotes") ? 1 : 0.75,
                        },
                      ]}
                    />

                    <ThemedText style={[styles.subLabel, { color: colors.textSecondary, marginTop: 10 }]}>Private</ThemedText>
                    <TextInput
                      value={privateNotes}
                      onChangeText={setPrivateNotes}
                      editable={canEdit("privateNotes")}
                      placeholder={canEdit("privateNotes") ? "Private notes..." : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("privateNotes") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("privateNotes") ? 1 : 0.75,
                        },
                      ]}
                    />
                  </RowCard>

                  {/* Abilities & Spells */}
                  <RowCard label="Abilities & Spells" colors={colors}>
                    <ThemedText style={[styles.subLabel, { color: colors.textSecondary }]}>Abilities (one per line)</ThemedText>
                    <TextInput
                      value={abilitiesRaw}
                      onChangeText={setAbilitiesRaw}
                      editable={canEdit("abilities")}
                      placeholder={canEdit("abilities") ? "Sneak Attack — extra damage on advantage" : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("abilities") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("abilities") ? 1 : 0.75,
                        },
                      ]}
                    />

                    <ThemedText style={[styles.subLabel, { color: colors.textSecondary, marginTop: 10 }]}>Spells (one per line)</ThemedText>
                    <TextInput
                      value={spellsRaw}
                      onChangeText={setSpellsRaw}
                      editable={canEdit("spells")}
                      placeholder={canEdit("spells") ? "Cure Wounds" : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("spells") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("spells") ? 1 : 0.75,
                        },
                      ]}
                    />
                  </RowCard>

                  {/* Stats (GM-only unless create) */}
                  <RowCard label="Stats" colors={colors}>
                    {!canEdit("stats") ? (
                      <ThemedText style={{ color: colors.textSecondary, lineHeight: 18 }}>
                        {readonlyHint("Stats")}
                      </ThemedText>
                    ) : null}

                    <StatRow label="Strength" value={str} onChangeText={setStr} editable={canEdit("stats")} colors={colors} />
                    <StatRow label="Dexterity" value={dex} onChangeText={setDex} editable={canEdit("stats")} colors={colors} />
                    <StatRow label="Constitution" value={con} onChangeText={setCon} editable={canEdit("stats")} colors={colors} />
                    <StatRow label="Intelligence" value={intell} onChangeText={setIntell} editable={canEdit("stats")} colors={colors} />
                    <StatRow label="Wisdom" value={wis} onChangeText={setWis} editable={canEdit("stats")} colors={colors} />
                    <StatRow label="Charisma" value={cha} onChangeText={setCha} editable={canEdit("stats")} colors={colors} />
                  </RowCard>

                  {/* Combat (GM-only unless create) */}
                  <RowCard label="Combat" colors={colors}>
                    {!canEdit("hp") && !canEdit("status") ? (
                      <ThemedText style={{ color: colors.textSecondary, lineHeight: 18 }}>
                        {readonlyHint("Combat")}
                      </ThemedText>
                    ) : null}

                    <StatRow label="HP (Current)" value={hpCur} onChangeText={setHpCur} editable={canEdit("hp")} colors={colors} />
                    <StatRow label="HP (Max)" value={hpMax} onChangeText={setHpMax} editable={canEdit("hp")} colors={colors} />
                    <InputRow label="Status" value={status} onChangeText={setStatus} editable={canEdit("status")} colors={colors} />
                  </RowCard>

                  {/* Inventory (owner editable in edit; all editable in create) */}
                  <RowCard label="Inventory (Private)" colors={colors}>
                    {!canEdit("inventory") ? (
                      <ThemedText style={{ color: colors.textSecondary, lineHeight: 18 }}>
                        {readonlyHint("Inventory")}
                      </ThemedText>
                    ) : null}

                    <TextInput
                      value={inventoryRaw}
                      onChangeText={setInventoryRaw}
                      editable={canEdit("inventory")}
                      placeholder={canEdit("inventory") ? "Torch x6\nRations x5\nRope (50 ft)" : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("inventory") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("inventory") ? 1 : 0.75,
                        },
                      ]}
                    />

                    <ThemedText style={[styles.subLabel, { color: colors.textSecondary, marginTop: 10 }]}>Equipment</ThemedText>
                    <TextInput
                      value={equipmentRaw}
                      onChangeText={setEquipmentRaw}
                      editable={canEdit("equipment")}
                      placeholder={canEdit("equipment") ? "Leather Armor\nShortbow" : ""}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[
                        styles.textarea,
                        {
                          color: canEdit("equipment") ? colors.text : colors.textSecondary,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: canEdit("equipment") ? 1 : 0.75,
                        },
                      ]}
                    />
                  </RowCard>

                  {!!(sheet as any)?.updatedAt ? (
                    <ThemedText style={{ color: colors.textMuted ?? colors.textSecondary, fontSize: 12 }}>
                      Last updated {new Date((sheet as any).updatedAt).toLocaleString()}
                    </ThemedText>
                  ) : null}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </ThemedView>
      </SafeAreaView>
    </>
  );
}

// ------------------------------
// small UI helpers
// ------------------------------

function InputRow({
  label,
  value,
  onChangeText,
  editable,
  colors,
  keyboardType,
  helperText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
  colors: any;
  keyboardType?: any;
  helperText?: string;
}) {
  return (
    <View style={styles.inputRow}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
        {!!helperText ? (
          <ThemedText style={{ color: colors.textMuted ?? colors.textSecondary, fontSize: 11 }} numberOfLines={2}>
            {helperText}
          </ThemedText>
        ) : null}
      </View>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            color: editable ? colors.text : colors.textSecondary,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: editable ? 1 : 0.75,
          },
        ]}
      />
    </View>
  );
}

function StatRow({
  label,
  value,
  onChangeText,
  editable,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
  colors: any;
}) {
  return (
    <InputRow
      label={label}
      value={value}
      onChangeText={(v) => onChangeText(v.replace(/[^0-9-]/g, ""))}
      editable={editable}
      colors={colors}
      keyboardType="number-pad"
    />
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
    gap: 10,
  },

  content: { padding: 16, paddingBottom: 28, gap: 12 },

  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  inputRow: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },

  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: "top",
  },

  subLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
});