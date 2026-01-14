// mobile/components/scenario/RpgChipsEditor.tsx

import React from "react";
import {
  Alert as RNAlert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";

// ---------- Types ----------
type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

export type InvItem = { id: string; name: string; qty?: number; notes?: string };
export type NamedItem = { id: string; name: string; notes?: string };

export type ProfileRpgData = {
  inventory: InvItem[];
  equipment: NamedItem[];
  spells: NamedItem[];
  abilities: NamedItem[];
};

type EditorKind = "inventory" | "equipment" | "spells" | "abilities";

type Props = {
  colors: ColorsLike;

  /** the current rpg data shown in chips */
  value: ProfileRpgData;

  /** called on any add/edit/delete with the next value */
  onChange: (next: ProfileRpgData) => void;

  /** if false, chips are view-only */
  editable?: boolean;

  /** show the “only gms can edit” footer (optional) */
  readonlyHint?: string;
};

// ---------- helpers ----------
function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function norm(s: any) {
  return String(s ?? "").trim();
}

function toIntOrUndef(v: any): number | undefined {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

function uniqById<T extends { id: string }>(arr: T[]) {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const it of arr ?? []) {
    const id = norm((it as any)?.id);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...(it as any), id } as T);
  }
  return out;
}

function sanitizeInv(arr: any[]): InvItem[] {
  const cleaned: InvItem[] = (Array.isArray(arr) ? arr : [])
    .map((x: any) => ({
      id: norm(x?.id) || uid("inv"),
      name: norm(x?.name),
      qty: x?.qty == null ? undefined : toIntOrUndef(x?.qty),
      notes: norm(x?.notes) || undefined,
    }))
    .filter((x) => !!x.name);

  return uniqById(cleaned);
}

function sanitizeNamed(arr: any[], prefix: string): NamedItem[] {
  const cleaned: NamedItem[] = (Array.isArray(arr) ? arr : [])
    .map((x: any) => ({
      id: norm(x?.id) || uid(prefix),
      name: norm(x?.name),
      notes: norm(x?.notes) || undefined,
    }))
    .filter((x) => !!x.name);

  return uniqById(cleaned);
}

function normalizeValue(v: ProfileRpgData): ProfileRpgData {
  return {
    inventory: sanitizeInv(v?.inventory ?? []),
    equipment: sanitizeNamed(v?.equipment ?? [], "eq"),
    spells: sanitizeNamed(v?.spells ?? [], "sp"),
    abilities: sanitizeNamed(v?.abilities ?? [], "ab"),
  };
}

// ---------- component ----------
export function RpgChipsEditor({ colors, value, onChange, editable = false, readonlyHint }: Props) {
  const insets = useSafeAreaInsets();

  const v = React.useMemo(() => normalizeValue(value), [value]);

  // editor modal state
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorKind, setEditorKind] = React.useState<EditorKind>("inventory");
  const [editorId, setEditorId] = React.useState<string>("");
  const [editorName, setEditorName] = React.useState<string>("");
  const [editorQty, setEditorQty] = React.useState<string>("");
  const [editorNotes, setEditorNotes] = React.useState<string>("");

  const openEditor = React.useCallback(
    (kind: EditorKind, existing?: InvItem | NamedItem | null) => {
      if (!editable) return;

      setEditorKind(kind);
      const id =
        existing?.id
          ? String(existing.id)
          : uid(kind === "inventory" ? "inv" : kind === "equipment" ? "eq" : kind === "spells" ? "sp" : "ab");
      setEditorId(id);
      setEditorName(norm((existing as any)?.name));
      setEditorNotes(norm((existing as any)?.notes));

      if (kind === "inventory") {
        const q = (existing as any)?.qty;
        setEditorQty(q == null ? "" : String(q));
      } else {
        setEditorQty("");
      }

      setEditorOpen(true);
    },
    [editable]
  );

  const closeEditor = React.useCallback(() => setEditorOpen(false), []);

  const editorTitle =
    editorKind === "inventory"
      ? editorName
        ? "Edit item"
        : "Add item"
      : editorKind === "equipment"
      ? editorName
        ? "Edit equipment"
        : "Add equipment"
      : editorKind === "spells"
      ? editorName
        ? "Edit spell"
        : "Add spell"
      : editorName
      ? "Edit ability"
      : "Add ability";

  const applyChange = React.useCallback(
    (next: ProfileRpgData) => {
      onChange(normalizeValue(next));
    },
    [onChange]
  );

  const upsertInvItem = React.useCallback(
    (item: InvItem) => {
      const nextInv = [...v.inventory];
      const idx = nextInv.findIndex((x) => x.id === item.id);
      if (idx >= 0) nextInv[idx] = item;
      else nextInv.push(item);

      applyChange({ ...v, inventory: sanitizeInv(nextInv as any) });
    },
    [v, applyChange]
  );

  const removeInvItemById = React.useCallback(
    (id: string) => {
      applyChange({ ...v, inventory: v.inventory.filter((x) => x.id !== id) });
    },
    [v, applyChange]
  );

  const upsertNamed = React.useCallback(
    (key: keyof Omit<ProfileRpgData, "inventory">, item: NamedItem, prefix: string) => {
      const arr = [...(v[key] as NamedItem[])];
      const idx = arr.findIndex((x) => x.id === item.id);
      if (idx >= 0) arr[idx] = item;
      else arr.push(item);

      applyChange({ ...v, [key]: sanitizeNamed(arr as any, prefix) } as ProfileRpgData);
    },
    [v, applyChange]
  );

  const removeNamedById = React.useCallback(
    (key: keyof Omit<ProfileRpgData, "inventory">, id: string) => {
      applyChange({ ...v, [key]: (v[key] as NamedItem[]).filter((x) => x.id !== id) } as ProfileRpgData);
    },
    [v, applyChange]
  );

  const saveEditor = React.useCallback(() => {
    if (!editable) return;

    const name = norm(editorName);
    if (!name) {
      RNAlert.alert("Missing name", "Please type a name.");
      return;
    }

    const notes = norm(editorNotes) || undefined;

    if (editorKind === "inventory") {
      const qty = editorQty ? toIntOrUndef(editorQty) : undefined;
      upsertInvItem({ id: editorId, name, qty, notes });
      closeEditor();
      return;
    }

    const item: NamedItem = { id: editorId, name, notes };
    if (editorKind === "equipment") upsertNamed("equipment", item, "eq");
    if (editorKind === "spells") upsertNamed("spells", item, "sp");
    if (editorKind === "abilities") upsertNamed("abilities", item, "ab");

    closeEditor();
  }, [editable, editorKind, editorId, editorName, editorQty, editorNotes, upsertInvItem, upsertNamed, closeEditor]);

  const deleteEditor = React.useCallback(() => {
    if (!editable) return;

    if (Platform.OS === "ios") {
      RNAlert.alert("Remove", "Delete this item?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (editorKind === "inventory") removeInvItemById(editorId);
            if (editorKind === "equipment") removeNamedById("equipment", editorId);
            if (editorKind === "spells") removeNamedById("spells", editorId);
            if (editorKind === "abilities") removeNamedById("abilities", editorId);
            closeEditor();
          },
        },
      ]);
      return;
    }

    // Use native RN alert for delete confirmation
    RNAlert.alert("Remove", "Delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (editorKind === "inventory") removeInvItemById(editorId);
          if (editorKind === "equipment") removeNamedById("equipment", editorId);
          if (editorKind === "spells") removeNamedById("spells", editorId);
          if (editorKind === "abilities") removeNamedById("abilities", editorId);
          closeEditor();
        },
      },
    ]);
  }, [editable, editorKind, editorId, removeInvItemById, removeNamedById, closeEditor]);

  const Section = ({
    title,
    emoji,
    kind,
    items,
    onAdd,
    onEdit,
    emptyText,
  }: {
    title: string;
    emoji: string;
    kind: EditorKind;
    items: Array<InvItem | NamedItem>;
    onAdd: () => void;
    onEdit: (it: any) => void;
    emptyText: string;
  }) => {
    const disabled = !editable;

    return (
      <View style={[styles.invBlock, { borderColor: colors.border, opacity: disabled ? 0.55 : 1 }]}>
        <View style={styles.invHeaderRow}>
          <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>
            {emoji} {title}
          </ThemedText>

          <Pressable
            disabled={disabled}
            onPress={onAdd}
            hitSlop={10}
            style={({ pressed }) => [
              styles.invAddBtn,
              {
                borderColor: colors.border,
                backgroundColor: pressed ? colors.pressed : "transparent",
                opacity: disabled ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add ${title}`}
          >
            <ThemedText style={{ color: colors.text, fontWeight: "900" }}>＋</ThemedText>
          </Pressable>
        </View>

        <View style={styles.invChipsWrap}>
          {items.length === 0 ? (
            <ThemedText style={{ color: colors.textSecondary }}>
              {disabled ? "view only" : emptyText}
            </ThemedText>
          ) : (
            items.map((it: any) => (
              <Pressable
                key={it.id}
                disabled={disabled}
                onPress={() => onEdit(it)}
                style={({ pressed }) => [
                  styles.invChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : "transparent",
                    opacity: disabled ? 0.9 : 1,
                  },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>
                  {it.name}
                  {kind === "inventory" && typeof it.qty === "number" ? ` ×${it.qty}` : ""}
                </ThemedText>
                {!disabled ? (
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: "900", marginLeft: 6 }}>✎</ThemedText>
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        {!editable && readonlyHint ? (
          <ThemedText style={{ color: colors.textSecondary, marginTop: 8, fontSize: 12 }}>{readonlyHint}</ThemedText>
        ) : null}
      </View>
    );
  };

  return (
    <>
      {/* editor modal (overlay to avoid RN Modal unmount/update loops) */}
      {editorOpen ? (
        <Pressable style={styles.editorBackdrop} onPress={closeEditor}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable
              onPress={(e) => e?.stopPropagation?.()}
              style={[
                styles.editorCard,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  marginBottom: 12 + insets.bottom,
                },
              ]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{editorTitle}</ThemedText>

              <ThemedText style={{ color: colors.textSecondary, marginTop: 6 }}>Name</ThemedText>
              <TextInput
                value={editorName}
                onChangeText={setEditorName}
                placeholder="ex: healing potion"
                placeholderTextColor={colors.textSecondary}
                style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
                autoFocus
              />

              {editorKind === "inventory" ? (
                <>
                  <ThemedText style={{ color: colors.textSecondary, marginTop: 10 }}>Quantity (optional)</ThemedText>
                  <TextInput
                    value={editorQty}
                    onChangeText={setEditorQty}
                    placeholder="ex: 2"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                    style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
                  />
                </>
              ) : null}

              <ThemedText style={{ color: colors.textSecondary, marginTop: 10 }}>Notes (optional)</ThemedText>
              <TextInput
                value={editorNotes}
                onChangeText={setEditorNotes}
                placeholder="ex: bought in elyria"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.editorInput,
                  { color: colors.text, borderColor: colors.border, height: 84, textAlignVertical: "top" },
                ]}
                multiline
              />

              <View style={styles.editorBtnRow}>
                <Pressable
                  onPress={closeEditor}
                  style={({ pressed }) => [
                    styles.editorBtn,
                    { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
                  ]}
                >
                  <ThemedText style={{ color: colors.text, fontWeight: "900" }}>Cancel</ThemedText>
                </Pressable>

                <Pressable
                  onPress={saveEditor}
                  style={({ pressed }) => [
                    styles.editorBtn,
                    { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
                  ]}
                >
                  <ThemedText style={{ color: colors.tint ?? colors.text, fontWeight: "900" }}>Save</ThemedText>
                </Pressable>
              </View>

              <Pressable
                onPress={deleteEditor}
                style={({ pressed }) => [
                  styles.editorDelete,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : "transparent",
                    opacity: editorName ? 1 : 0.65,
                  },
                ]}
              >
                <ThemedText style={{ color: "#ff3b30", fontWeight: "900" }}>Delete</ThemedText>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      ) : null}

      {/* blocks */}
      <Section
        title="items"
        emoji="🎒"
        kind="inventory"
        items={v.inventory}
        onAdd={() => openEditor("inventory", null)}
        onEdit={(it) => openEditor("inventory", it)}
        emptyText="no items — tap ＋ to add"
      />

      <View style={{ height: 10 }} />

      <Section
        title="equipped"
        emoji="🛡️"
        kind="equipment"
        items={v.equipment}
        onAdd={() => openEditor("equipment", null)}
        onEdit={(it) => openEditor("equipment", it)}
        emptyText="none"
      />

      <View style={{ height: 10 }} />

      <Section
        title="known"
        emoji="✨"
        kind="spells"
        items={v.spells}
        onAdd={() => openEditor("spells", null)}
        onEdit={(it) => openEditor("spells", it)}
        emptyText="none"
      />

      <View style={{ height: 10 }} />

      <Section
        title="traits"
        emoji="🧠"
        kind="abilities"
        items={v.abilities}
        onAdd={() => openEditor("abilities", null)}
        onEdit={(it) => openEditor("abilities", it)}
        emptyText="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  invBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
  },
  invHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  invAddBtn: {
    width: 34,
    height: 30,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  invChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  invChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: "100%",
  },

  editorBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
  },
  editorCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  editorInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  editorBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  editorBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editorDelete: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});