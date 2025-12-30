// mobile/components/campaign/GmTurnEditor.tsx
import React from "react";
import { Modal, Pressable, StyleSheet, View, ScrollView, TextInput, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/data/db/schema";
import type { CharacterSheet, StatKey } from "@/lib/campaign/sheetTypes";

type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;

  colors: ColorsLike;

  // target selection
  targets: Profile[]; // 1 or more

  // sheet IO
  getSheet: (profileId: string) => CharacterSheet | null;
  updateSheet: (profileId: string, next: CharacterSheet) => void;

  // posting as GM
  gmProfileId: string;
  createGmPost: (payload: { scenarioId: string; text: string }) => void;

  scenarioId: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeInt(v: string, fallback: number) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

type SheetDiff = {
  hp?: { from: number; to: number; maxFrom: number; maxTo: number };
  level?: { from: number; to: number };
  status?: { from?: string; to?: string };
  stats?: Partial<Record<StatKey, { from: number; to: number }>>;
};

function diffSheet(a: CharacterSheet, b: CharacterSheet): SheetDiff {
  const d: SheetDiff = {};

  if (a.hp !== b.hp || a.maxHp !== b.maxHp) d.hp = { from: a.hp, to: b.hp, maxFrom: a.maxHp, maxTo: b.maxHp };
  if (a.level !== b.level) d.level = { from: a.level, to: b.level };
  if ((a.status ?? "") !== (b.status ?? "")) d.status = { from: a.status, to: b.status };

  const statKeys = Object.keys(a.stats) as StatKey[];
  const statsChanged: SheetDiff["stats"] = {};
  for (const k of statKeys) {
    if (a.stats[k] !== b.stats[k]) statsChanged[k] = { from: a.stats[k], to: b.stats[k] };
  }
  if (Object.keys(statsChanged).length) d.stats = statsChanged;

  return d;
}

function hasAnyDiff(d: SheetDiff) {
  return Boolean(d.hp || d.level || d.status || (d.stats && Object.keys(d.stats).length));
}

function formatDiffLine(handle: string, diff: SheetDiff) {
  const lines: string[] = [];
  lines.push(`@${handle}`);

  if (diff.hp) {
    lines.push(`❤️ hp: ${diff.hp.from}/${diff.hp.maxFrom} → ${diff.hp.to}/${diff.hp.maxTo}`);
  }
  if (diff.status) {
    const f = diff.status.from ?? "—";
    const t = diff.status.to ?? "—";
    lines.push(`🏷️ status: ${f} → ${t}`);
  }
  if (diff.level) {
    lines.push(`📈 level: ${diff.level.from} → ${diff.level.to}`);
  }
  if (diff.stats) {
    const parts = Object.entries(diff.stats).map(([k, v]) => `🧬 ${k}: ${v!.from} → ${v!.to}`);
    lines.push(...parts);
  }

  return lines.join("\n");
}

export function GmTurnEditor({
  visible,
  onClose,
  colors,
  targets,
  getSheet,
  updateSheet,
  gmProfileId,
  createGmPost,
  scenarioId,
}: Props) {
  const insets = useSafeAreaInsets();

  // If multiple targets: V1 rule = no live per-target display (as you requested)
  const multi = targets.length > 1;

  const originalRef = React.useRef<Record<string, CharacterSheet>>({});
  const [draft, setDraft] = React.useState<CharacterSheet | null>(null);

  // pick primary target = first
  const primary = targets[0];

  React.useEffect(() => {
    if (!visible) return;

    // snapshot originals
    const originals: Record<string, CharacterSheet> = {};
    for (const t of targets) {
      const s = getSheet(t.id);
      if (s) originals[t.id] = JSON.parse(JSON.stringify(s));
    }
    originalRef.current = originals;

    // draft only when single target
    if (!multi) {
      const s = getSheet(primary.id);
      setDraft(s ? JSON.parse(JSON.stringify(s)) : null);
    } else {
      setDraft(null);
    }
  }, [visible, targets.map(t => t.id).join("|")]); // ok for v1

  const close = () => onClose();

  const commitDone = () => {
    // Build diffs + commit
    const originals = originalRef.current;

    const blocks: string[] = [];
    if (multi) {
      // For multi-target V1: apply nothing unless you implement per-target editing.
      // If you want multi-target to work, you’ll store a draft map per target.
      close();
      return;
    }

    if (!draft) {
      close();
      return;
    }

    const orig = originals[primary.id];
    if (!orig) {
      close();
      return;
    }

    const d = diffSheet(orig, draft);
    if (!hasAnyDiff(d)) {
      close();
      return;
    }

    // commit sheet
    updateSheet(primary.id, draft);

    // create GM post
    const text =
      `⚙️ gm update\n\n` +
      formatDiffLine(primary.handle, d);

    createGmPost({ scenarioId, text });

    close();
  };

  const bumpHp = (delta: number) => {
    if (!draft) return;
    const nextHp = clamp(draft.hp + delta, 0, draft.maxHp);
    setDraft({ ...draft, hp: nextHp });
  };

  const bumpMaxHp = (delta: number) => {
    if (!draft) return;
    const nextMax = Math.max(1, draft.maxHp + delta);
    const nextHp = clamp(draft.hp, 0, nextMax);
    setDraft({ ...draft, maxHp: nextMax, hp: nextHp });
  };

  const bumpLevel = (delta: number) => {
    if (!draft) return;
    setDraft({ ...draft, level: Math.max(1, draft.level + delta) });
  };

  const bumpStat = (k: StatKey, delta: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      stats: { ...draft.stats, [k]: draft.stats[k] + delta },
    });
  };

  const setStatus = (v: string) => {
    if (!draft) return;
    setDraft({ ...draft, status: v.trim() });
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.safeRoot} edges={["left", "right", "bottom"]}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            onPress={() => {}}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: 10 + insets.bottom,
              },
            ]}
          >
            {/* Top bar: Cancel (left) + Done (right) */}
            <View style={styles.topBar}>
              <Pressable onPress={close} hitSlop={10} style={styles.topBtn}>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "800" }}>
                  cancel
                </ThemedText>
              </Pressable>

              <ThemedText style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>
                gm actions
              </ThemedText>

              <Pressable onPress={commitDone} hitSlop={10} style={styles.topBtn}>
                <ThemedText style={{ color: colors.tint ?? colors.text, fontSize: 16, fontWeight: "900" }}>
                  done
                </ThemedText>
              </Pressable>
            </View>

            {/* Target header */}
            <View style={[styles.targetRow, { borderColor: colors.border }]}>
              <Avatar uri={primary.avatarUrl} size={32} fallbackColor={colors.border} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                  {multi ? "multiple targets" : primary.displayName}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary }} numberOfLines={1}>
                  {multi ? `👥 ${targets.length} selected` : `@${primary.handle}`}
                </ThemedText>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {/* Live values only when single */}
              {multi ? (
                <View style={[styles.noticeBox, { borderColor: colors.border }]}>
                  <ThemedText style={{ color: colors.textSecondary, lineHeight: 18 }}>
                    live values are hidden when multiple targets are selected (v1).
                  </ThemedText>
                </View>
              ) : !draft ? (
                <View style={[styles.noticeBox, { borderColor: colors.border }]}>
                  <ThemedText style={{ color: colors.textSecondary }}>
                    no sheet found for this profile yet.
                  </ThemedText>
                </View>
              ) : (
                <>
                  {/* HP */}
                  <SectionTitle colors={colors} title="❤️ hp" />
                  <ValueRow
                    colors={colors}
                    label="current"
                    value={`${draft.hp} / ${draft.maxHp}`}
                    leftButtons={[
                      { key: "hp-5", label: "−5", onPress: () => bumpHp(-5) },
                      { key: "hp-1", label: "−1", onPress: () => bumpHp(-1) },
                    ]}
                    rightButtons={[
                      { key: "hp+1", label: "+1", onPress: () => bumpHp(1) },
                      { key: "hp+5", label: "+5", onPress: () => bumpHp(5) },
                    ]}
                  />

                  <InlineSetRow
                    colors={colors}
                    label="set hp"
                    value={String(draft.hp)}
                    onChange={(v) => setDraft({ ...draft, hp: clamp(safeInt(v, draft.hp), 0, draft.maxHp) })}
                  />
                  <InlineSetRow
                    colors={colors}
                    label="set max"
                    value={String(draft.maxHp)}
                    onChange={(v) => {
                      const nextMax = Math.max(1, safeInt(v, draft.maxHp));
                      setDraft({ ...draft, maxHp: nextMax, hp: clamp(draft.hp, 0, nextMax) });
                    }}
                    extraButtons={[
                      { key: "max-1", label: "−1", onPress: () => bumpMaxHp(-1) },
                      { key: "max+1", label: "+1", onPress: () => bumpMaxHp(1) },
                    ]}
                  />

                  {/* Status */}
                  <SectionTitle colors={colors} title="🏷️ status" />
                  <InlineSetRow
                    colors={colors}
                    label="status"
                    value={draft.status ?? ""}
                    placeholder="normal / poisoned / stunned…"
                    onChange={setStatus}
                  />

                  {/* Level */}
                  <SectionTitle colors={colors} title="📈 level" />
                  <ValueRow
                    colors={colors}
                    label="level"
                    value={String(draft.level)}
                    leftButtons={[{ key: "lvl-1", label: "−1", onPress: () => bumpLevel(-1) }]}
                    rightButtons={[{ key: "lvl+1", label: "+1", onPress: () => bumpLevel(1) }]}
                  />
                  <InlineSetRow
                    colors={colors}
                    label="set level"
                    value={String(draft.level)}
                    onChange={(v) => setDraft({ ...draft, level: Math.max(1, safeInt(v, draft.level)) })}
                  />

                  {/* Stats */}
                  <SectionTitle colors={colors} title="🧬 stats" />
                  {Object.keys(draft.stats).map((k) => {
                    const key = k as StatKey;
                    return (
                      <ValueRow
                        key={key}
                        colors={colors}
                        label={key}
                        value={String(draft.stats[key])}
                        leftButtons={[{ key: `${key}-1`, label: "−1", onPress: () => bumpStat(key, -1) }]}
                        rightButtons={[{ key: `${key}+1`, label: "+1", onPress: () => bumpStat(key, 1) }]}
                      />
                    );
                  })}
                </>
              )}

              {/* bottom spacer */}
              <View style={{ height: 8 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function SectionTitle({ colors, title }: { colors: ColorsLike; title: string }) {
  return (
    <ThemedText style={{ color: colors.textSecondary, fontWeight: "900", marginTop: 14, marginBottom: 8, paddingHorizontal: 12 }}>
      {title}
    </ThemedText>
  );
}

function ChipButton({
  colors,
  label,
  onPress,
}: {
  colors: ColorsLike;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
      ]}
    >
      <ThemedText style={{ color: colors.text, fontWeight: "900" }}>{label}</ThemedText>
    </Pressable>
  );
}

function ValueRow({
  colors,
  label,
  value,
  leftButtons,
  rightButtons,
}: {
  colors: ColorsLike;
  label: string;
  value: string;
  leftButtons: { key: string; label: string; onPress: () => void }[];
  rightButtons: { key: string; label: string; onPress: () => void }[];
}) {
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <ThemedText style={{ color: colors.textSecondary, width: 60, fontWeight: "800" }}>{label}</ThemedText>

      <View style={styles.btnRow}>
        {leftButtons.map((b) => (
          <ChipButton key={b.key} colors={colors} label={b.label} onPress={b.onPress} />
        ))}
      </View>

      <ThemedText style={{ color: colors.text, fontWeight: "900", minWidth: 90, textAlign: "center" }}>
        {value}
      </ThemedText>

      <View style={styles.btnRow}>
        {rightButtons.map((b) => (
          <ChipButton key={b.key} colors={colors} label={b.label} onPress={b.onPress} />
        ))}
      </View>
    </View>
  );
}

function InlineSetRow({
  colors,
  label,
  value,
  onChange,
  placeholder,
  extraButtons,
}: {
  colors: ColorsLike;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  extraButtons?: { key: string; label: string; onPress: () => void }[];
}) {
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <ThemedText style={{ color: colors.textSecondary, width: 60, fontWeight: "800" }}>{label}</ThemedText>

      {extraButtons?.length ? (
        <View style={styles.btnRow}>
          {extraButtons.map((b) => (
            <ChipButton key={b.key} colors={colors} label={b.label} onPress={b.onPress} />
          ))}
        </View>
      ) : null}

      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: Platform.OS === "ios" ? "transparent" : "transparent",
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },

  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },

  topBar: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBtn: { paddingVertical: 6, paddingHorizontal: 6 },

  targetRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  noticeBox: {
    marginTop: 14,
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },

  row: {
    marginHorizontal: 14,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  btnRow: { flexDirection: "row", gap: 8, alignItems: "center" },

  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },

  inputWrap: { flex: 1 },
  input: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontWeight: "700",
  },
});