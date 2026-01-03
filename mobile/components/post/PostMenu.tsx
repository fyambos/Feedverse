// mobile/components/post/PostMenu.tsx
import React from "react";
import { Alert, Dimensions, Modal, Pressable, StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile, Post as DbPost, CharacterSheet as DbCharacterSheet } from "@/data/db/schema";
import { useAppData } from "@/context/appData";
import { RpgChipsEditor, type ProfileRpgData } from "@/components/scenario/RpgChipsEditor";

// ---------- Types ----------

type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

type ProfileViewState =
  | "normal"
  | "muted"
  | "blocked"
  | "blocked_by"
  | "suspended"
  | "deactivated"
  | "reactivated"
  | "reported"
  | "privated";

type Props = {
  visible: boolean;
  onClose: () => void;

  colors: ColorsLike;

  isCampaign: boolean;
  profile: Profile; // author of the post
  item: DbPost;

  // normal menu wiring
  onReportPost: () => void;
  onOpenProfile: (view?: ProfileViewState) => void;

  // campaign wiring (PostMenu becomes the editor)
  scenarioId?: string;
  gmProfileId?: string; // who posts the recap
  getSheet?: (profileId: string) => DbCharacterSheet | null;
  updateSheet?: (profileId: string, next: DbCharacterSheet) => void;
  createGmPost?: (payload: { scenarioId: string; text: string; authorProfileId: string }) => void;
};

type MenuItem = {
  key: string;
  label?: string;
  emoji?: string;
  danger?: boolean;
  onPress?: () => void;
  render?: () => React.ReactNode;
};

type MenuSection = {
  title: string;
  emoji?: string;
  items: MenuItem[];
};

function menuLabelToView(label: string): ProfileViewState | null {
  switch (label) {
    case "Blocked account":
      return "blocked";
    case "Blocked by account":
      return "blocked_by";
    case "Suspended account":
      return "suspended";
    case "Deactivated account":
      return "deactivated";
    case "Reactivated account":
      return "reactivated";
    case "Privated account":
      return "privated";
    case "Muted account":
      return "muted";
    default:
      return null;
  }
}

// ---------- Sheet helpers (schema-safe) ----------

function getHp(s: any): number {
  if (typeof s?.hp === "object" && typeof s.hp?.current === "number") return s.hp.current;
  if (typeof s?.hp === "number") return s.hp;
  if (typeof s?.currentHp === "number") return s.currentHp;
  return 0;
}

function setHp(s: any, hp: number) {
  if (typeof s?.hp === "object") return { ...s, hp: { ...s.hp, current: hp } };
  if (typeof s?.hp === "number" || s?.hp === undefined) return { ...s, hp };
  if (typeof s?.currentHp === "number") return { ...s, currentHp: hp };
  return { ...s, hp };
}

function getMaxHp(s: any): number {
  if (typeof s?.hp === "object" && typeof s.hp?.max === "number") return s.hp.max;
  if (typeof s?.maxHp === "number") return s.maxHp;
  if (typeof s?.hpMax === "number") return s.hpMax;
  return Math.max(1, getHp(s));
}

function setMaxHp(s: any, maxHp: number) {
  if (typeof s?.hp === "object") return { ...s, hp: { ...s.hp, max: maxHp } };
  if (typeof s?.maxHp === "number" || s?.maxHp === undefined) return { ...s, maxHp };
  if (typeof s?.hpMax === "number") return { ...s, hpMax: maxHp };
  return { ...s, maxHp };
}

function getLevel(s: any): number {
  return typeof s?.level === "number" ? s.level : 1;
}

function setLevel(s: any, level: number) {
  return { ...s, level };
}

function getStatus(s: any): string {
  return typeof s?.status === "string" ? s.status : "";
}

function setStatus(s: any, status: string) {
  return { ...s, status };
}

type StatKey = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
const STAT_KEYS: StatKey[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

function getStat(s: any, k: StatKey): number {
  const stats = s?.stats;
  if (stats && typeof stats === "object" && typeof stats[k] === "number") return stats[k];
  return 0;
}

function setStat(s: any, k: StatKey, v: number) {
  const stats = s?.stats && typeof s.stats === "object" ? s.stats : {};
  return { ...s, stats: { ...stats, [k]: v } };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}


function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------- RPG sheet/profile helpers (delegated to RpgChipsEditor types) ----------

function getRpgFromSheet(sheet: any): ProfileRpgData {
  return {
    inventory: Array.isArray(sheet?.inventory) ? sheet.inventory : [],
    equipment: Array.isArray(sheet?.equipment) ? sheet.equipment : [],
    spells: Array.isArray(sheet?.spells) ? sheet.spells : [],
    abilities: Array.isArray(sheet?.abilities) ? sheet.abilities : [],
  };
}

function setRpgOnSheet(sheet: any, next: ProfileRpgData) {
  return {
    ...sheet,
    inventory: Array.isArray(next?.inventory) ? next.inventory : [],
    equipment: Array.isArray(next?.equipment) ? next.equipment : [],
    spells: Array.isArray(next?.spells) ? next.spells : [],
    abilities: Array.isArray(next?.abilities) ? next.abilities : [],
  };
}

// Legacy fallback for non-campaign/legacy profiles
function getRpgFromProfile(p: any): ProfileRpgData {
  const src = (p?.settings && typeof p.settings === "object" ? p.settings : {}) as any;
  const root = (src?.rpg && typeof src.rpg === "object" ? src.rpg : {}) as any;
  return {
    inventory: Array.isArray(root?.inventory ?? src?.inventory) ? (root?.inventory ?? src?.inventory) : [],
    equipment: Array.isArray(root?.equipment ?? src?.equipment) ? (root?.equipment ?? src?.equipment) : [],
    spells: Array.isArray(root?.spells ?? src?.spells) ? (root?.spells ?? src?.spells) : [],
    abilities: Array.isArray(root?.abilities ?? src?.abilities) ? (root?.abilities ?? src?.abilities) : [],
  };
}

function diffLines(before: any, after: any, handle: string) {
  const lines: string[] = [];
  lines.push(`@${handle}`);

  const hpB = getHp(before);
  const hpA = getHp(after);
  const maxB = getMaxHp(before);
  const maxA = getMaxHp(after);

  if (hpB !== hpA || maxB !== maxA) {
    lines.push(`❤️ hp: ${hpB}/${maxB} → ${hpA}/${maxA}`);
  }

  const stB = getStatus(before) || "—";
  const stA = getStatus(after) || "—";
  if (stB !== stA) lines.push(`🏷️ status: ${stB} → ${stA}`);

  const lvlB = getLevel(before);
  const lvlA = getLevel(after);
  if (lvlB !== lvlA) lines.push(`📈 level: ${lvlB} → ${lvlA}`);

  for (const k of STAT_KEYS) {
    const b = getStat(before, k);
    const a = getStat(after, k);
    if (b !== a) lines.push(`🧬 ${k}: ${b} → ${a}`);
  }

  return lines.join("\n");
}

function hasAnyDiff(before: any, after: any) {
  if (getHp(before) !== getHp(after)) return true;
  if (getMaxHp(before) !== getMaxHp(after)) return true;
  if ((getStatus(before) || "") !== (getStatus(after) || "")) return true;
  if (getLevel(before) !== getLevel(after)) return true;
  for (const k of STAT_KEYS) {
    if (getStat(before, k) !== getStat(after, k)) return true;
  }
  return false;
}

// ---------- Component ----------
export function PostMenu({
  visible,
  onClose,
  colors,
  isCampaign,
  profile,
  item,
  onReportPost,
  onOpenProfile,

  scenarioId,
  gmProfileId,
  getSheet,
  updateSheet,
  createGmPost,
}: Props) {
  const appData = useAppData();
  // CharacterSheet helpers from appData
  const getCharacterSheetByProfileId = (appData as any)?.getCharacterSheetByProfileId;
  const upsertCharacterSheet = (appData as any)?.upsertCharacterSheet;
  const [pinBusy, setPinBusy] = React.useState(false);

  const [rpgDraft, setRpgDraft] = React.useState<ProfileRpgData>({
    inventory: [],
    equipment: [],
    spells: [],
    abilities: [],
  });

  const canEditRpg = Boolean(isCampaign && scenarioId && gmProfileId);

  // Load RPG data when menu opens / target profile changes
  React.useEffect(() => {
    if (!visible) return;

    try {
      const sheet = getCharacterSheetByProfileId?.(profile.id) ?? null;
      if (sheet) {
        setRpgDraft(getRpgFromSheet(sheet));
        return;
      }
    } catch {}

    // fallback (non-campaign / legacy)
    setRpgDraft(getRpgFromProfile(profile));
  }, [visible, profile.id, getCharacterSheetByProfileId]);

  const persistRpg = React.useCallback(
    async (nextRpg: ProfileRpgData) => {
      if (!canEditRpg) return;

      try {
        const sheet = getCharacterSheetByProfileId?.(profile.id) ?? null;
        if (!sheet) {
          Alert.alert("No sheet found", "This profile has no character sheet yet.");
          return;
        }

        const nextSheet = setRpgOnSheet(sheet, nextRpg);
        await upsertCharacterSheet?.(nextSheet);

        // keep local draft in sync
        setRpgDraft(getRpgFromSheet(nextSheet));
      } catch (e: any) {
        Alert.alert("Failed to update", e?.message ?? "Could not save changes.");
      }
    },
    [canEditRpg, getCharacterSheetByProfileId, upsertCharacterSheet, profile.id]
  );

  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const sheetMaxH = Math.max(320, screenH - insets.top - 12);

  // ---------- NORMAL MENU ----------
  const REPORT_LABEL = "Report post";

  const STATE_OPTIONS = React.useMemo(
    () => [
      "Blocked account",
      "Muted account",
      "Blocked by account",
      "Suspended account",
      "Deactivated account",
      "Reactivated account",
      "Privated account",
    ],
    []
  );

  const onStateOption = (label: string) => {
    onClose();
    const view = menuLabelToView(label);
    if (view) onOpenProfile(view);
  };

  // ---------- CAMPAIGN MODE: PostMenu is the editor ----------
  const originalRef = React.useRef<any | null>(null);
  const [draft, setDraft] = React.useState<any | null>(null);

  React.useEffect(() => {
    if (!visible) return;

    if (!isCampaign) {
      originalRef.current = null;
      setDraft(null);
      return;
    }

    const sheet = getSheet?.(profile.id) ?? null;

    if (!sheet) {
      originalRef.current = null;
      setDraft(null);
      return;
    }

    originalRef.current = deepClone(sheet);
    setDraft(deepClone(sheet));
  }, [visible, isCampaign, profile.id, getSheet]);

  const bumpHp = (delta: number) => {
    if (!draft) return;
    const max = getMaxHp(draft);
    const next = clamp(getHp(draft) + delta, 0, max);
    setDraft(setHp(draft, next));
  };

  const healToMax = () => {
    if (!draft) return;
    setDraft(setHp(draft, getMaxHp(draft)));
  };

  const downToZero = () => {
    if (!draft) return;
    setDraft(setHp(draft, 0));
  };

  const reviveToOne = () => {
    if (!draft) return;
    setDraft(setHp(draft, clamp(1, 0, getMaxHp(draft))));
  };

  const bumpLevel = (delta: number) => {
    if (!draft) return;
    const next = Math.max(1, getLevel(draft) + delta);
    setDraft(setLevel(draft, next));
  };

  const bumpStat = (k: StatKey, delta: number) => {
    if (!draft) return;
    const next = getStat(draft, k) + delta;
    setDraft(setStat(draft, k, next));
  };

  const setStatusManually = () => {
    if (!draft) return;

    const current = getStatus(draft) || "";

    // iOS: Alert.prompt exists
    const anyAlert = Alert as any;
    if (typeof anyAlert.prompt === "function") {
      anyAlert.prompt(
        "Set status",
        "Type a status (ex: ok, down, stunned, bleeding...)",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear",
            style: "destructive",
            onPress: () => setDraft(setStatus(draft, "")),
          },
          {
            text: "Save",
            onPress: (value?: string) => setDraft(setStatus(draft, String(value ?? "").trim())),
          },
        ],
        "plain-text",
        current
      );
      return;
    }

    // Android fallback (no prompt): quick preset + clear
    Alert.alert("Set status", current ? `Current: ${current}` : "Current: —", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => setDraft(setStatus(draft, "")) },
      { text: "OK", onPress: () => {} },
    ]);
  };

  const commitDone = () => {
    if (!isCampaign) {
      onClose();
      return;
    }

    if (!scenarioId || !gmProfileId || !updateSheet || !createGmPost) {
      Alert.alert("GM actions not wired", "Missing scenarioId / gmProfileId / updateSheet / createGmPost.");
      return;
    }

    if (!draft || !originalRef.current) {
      Alert.alert("No sheet found", "This profile has no character sheet yet.");
      return;
    }

    const before = originalRef.current;
    const after = draft;

    if (!hasAnyDiff(before, after)) {
      onClose();
      return;
    }

    const nextSheet = { ...after, profileId: profile.id } as DbCharacterSheet;

    updateSheet(profile.id, nextSheet);

    const text = `⚙️ gm update\n\n` + diffLines(before, nextSheet, profile.handle);

    createGmPost({
      scenarioId: String(scenarioId),
      authorProfileId: String(gmProfileId),
      text,
    });

    onClose();
  };

  // pinned state (your DB uses isPinned + pinOrder)
  const pinned = Boolean((item as any)?.isPinned) || Number((item as any)?.pinOrder ?? 0) > 0;

  const onTogglePin = async () => {
    if (!scenarioId) {
      Alert.alert("Pin/Unpin failed", "Missing scenarioId.");
      return;
    }

    if (pinBusy) return;

    const nextPinned = !pinned;

    try {
      setPinBusy(true);
      await appData.togglePinPost(String(scenarioId), String(item.id), nextPinned);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update pin status.");
    } finally {
      setPinBusy(false);
    }
  };

  // ---------- Sections ----------
  const NORMAL_SECTIONS: MenuSection[] = React.useMemo(
    () => [
      {
        title: "Post",
        emoji: "🚩",
        items: [
          {
            key: "report",
            emoji: "🚩",
            label: REPORT_LABEL,
            danger: true,
            onPress: () => {
              onClose();
              onReportPost();
            },
          },
        ],
      },
      {
        title: "Profile (view as…)",
        emoji: "👤",
        items: STATE_OPTIONS.map((label) => ({
          key: label,
          emoji:
            label === "Blocked account"
              ? "⛔️"
              : label === "Muted account"
              ? "🔇"
              : label === "Blocked by account"
              ? "🚫"
              : label === "Suspended account"
              ? "🧊"
              : label === "Deactivated account"
              ? "🛑"
              : label === "Reactivated account"
              ? "✅"
              : label === "Privated account"
              ? "🔒"
              : "⚙️",
          label,
          onPress: () => onStateOption(label),
        })),
      },
    ],
    [STATE_OPTIONS]
  );

  const GM_SECTIONS: MenuSection[] = React.useMemo(
    () => [
      {
        title: "HP",
        emoji: "❤️",
        items: [
          { key: "hp_m5", emoji: "➖", label: "HP −5", onPress: () => bumpHp(-5) },
          { key: "hp_m1", emoji: "➖", label: "HP −1", onPress: () => bumpHp(-1) },
          { key: "hp_p1", emoji: "➕", label: "HP +1", onPress: () => bumpHp(1) },
          { key: "hp_p5", emoji: "➕", label: "HP +5", onPress: () => bumpHp(5) },
          { key: "hp_full", emoji: "💚", label: "Heal to Max", onPress: healToMax },
          { key: "hp_down", emoji: "💀", label: "Down / KO (0 HP)", onPress: downToZero },
          { key: "hp_revive", emoji: "✨", label: "Revive (1 HP)", onPress: reviveToOne },
        ],
      },
      {
        title: "Level",
        emoji: "📈",
        items: [
          { key: "lvl_p1", emoji: "📈", label: "Level +1", onPress: () => bumpLevel(1) },
          { key: "lvl_m1", emoji: "📉", label: "Level −1", onPress: () => bumpLevel(-1) },
        ],
      },
      {
        title: "Stats",
        emoji: "🧬",
        items: [
          {
            key: "stats_block",
            render: () => (
              <View style={[styles.statsBlock, { borderColor: colors.border }]}>
                {STAT_KEYS.map((k) => {
                  const value = draft ? getStat(draft, k) : 0;
                  const short =
                    k === "strength"
                      ? "STR"
                      : k === "dexterity"
                      ? "DEX"
                      : k === "constitution"
                      ? "CON"
                      : k === "intelligence"
                      ? "INT"
                      : k === "wisdom"
                      ? "WIS"
                      : "CHA";

                  const disabled = !draft;

                  return (
                    <View key={k} style={styles.statRow}>
                      <ThemedText style={{ color: colors.textSecondary, fontWeight: "800", width: 52 }}>{short}</ThemedText>

                      <Pressable
                        disabled={disabled}
                        onPress={() => bumpStat(k, -1)}
                        style={({ pressed }) => [
                          styles.stepBtn,
                          {
                            borderColor: colors.border,
                            backgroundColor: pressed ? colors.pressed : "transparent",
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                      >
                        <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>−</ThemedText>
                      </Pressable>

                      <ThemedText
                        style={{ color: colors.text, fontSize: 16, fontWeight: "900", width: 42, textAlign: "center" }}
                      >
                        {value}
                      </ThemedText>

                      <Pressable
                        disabled={disabled}
                        onPress={() => bumpStat(k, +1)}
                        style={({ pressed }) => [
                          styles.stepBtn,
                          {
                            borderColor: colors.border,
                            backgroundColor: pressed ? colors.pressed : "transparent",
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                      >
                        <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>+</ThemedText>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ),
          },
        ],
      },
      {
        title: "Status",
        emoji: "🏷️",
        items: [{ key: "status_set", emoji: "🏷️", label: "Set status…", onPress: setStatusManually }],
      },
      {
        title: "RPG",
        emoji: "🎒",
        items: [
          {
            key: "rpg_block",
            render: () => (
              <RpgChipsEditor
                colors={colors}
                value={rpgDraft}
                editable={canEditRpg}
                readonlyHint={!canEditRpg ? "only the scenario owner / gms can edit." : undefined}
                onChange={(next) => {
                  setRpgDraft(next);
                  void persistRpg(next);
                }}
              />
            ),
          },
        ],
      },
    ],
    [
      draft,
      rpgDraft,
      canEditRpg,
      colors.border,
      colors.pressed,
      colors.text,
      colors.textSecondary,
    ]
  );

  const sections = isCampaign ? GM_SECTIONS : NORMAL_SECTIONS;

  // ---------- UI ----------
  const renderCampaignHeader = () => {
    const hp = draft ? getHp(draft) : null;
    const maxHp = draft ? getMaxHp(draft) : null;
    const lvl = draft ? getLevel(draft) : null;
    const st = draft ? getStatus(draft) || "—" : null;

    return (
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
            ⚙️ gm actions (target: @{profile.handle})
          </ThemedText>

          <ThemedText style={{ color: colors.text, fontSize: 14, fontWeight: "900", marginTop: 4 }}>
            {draft ? `❤️ ${hp}/${maxHp}   📈 lvl ${lvl}   🏷️ ${st}` : "no sheet found for this profile"}
          </ThemedText>
        </View>

        <Pressable
          onPress={commitDone}
          style={({ pressed }) => [
            styles.doneBtn,
            {
              backgroundColor: pressed ? colors.pressed : "transparent",
              borderColor: colors.border,
              opacity: draft ? 1 : 0.5,
            },
          ]}
          disabled={!draft}
        >
          <ThemedText style={{ color: colors.tint ?? colors.text, fontSize: 16, fontWeight: "900" }}>done</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeRoot} edges={["top", "left", "right", "bottom"]}>
        <Pressable style={styles.menuBackdrop} onPress={onClose}>
          <Pressable
            style={[
              styles.menuSheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: 10 + insets.bottom, // protects Cancel
                maxHeight: sheetMaxH, // prevents reaching under notch
                marginTop: 8, // breathing room from top if tall
              },
            ]}
            onPress={() => {}}
          >
            {/* Header (author profile) */}
            <View style={styles.menuHeaderRow}>
              <View style={styles.menuHeaderAuthorRow}>
                <Avatar uri={profile.avatarUrl} size={28} fallbackColor={colors.border} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: colors.text, fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
                    {profile.displayName}
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                    @{profile.handle}
                  </ThemedText>
                </View>
              </View>

              {isCampaign ? (
                <Pressable
                  onPress={onTogglePin}
                  disabled={pinBusy}
                  style={({ pressed }) => [
                    styles.pinBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.pressed : "transparent",
                      opacity: pinBusy ? 0.6 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={pinned ? "Unpin Post" : "Pin Post"}
                >
                  <ThemedText style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>
                    {pinBusy ? "…" : pinned ? "Unpin Post" : "Pin Post"}
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedText style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }} numberOfLines={1}>
                  ⋯ post options
                </ThemedText>
              )}
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {isCampaign ? renderCampaignHeader() : null}

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {sections.map((sec, idx) => (
                <View key={sec.title}>
                  <ThemedText style={[styles.menuSectionTitle, { color: colors.textSecondary }]}>
                    {sec.emoji ? `${sec.emoji} ` : ""}
                    {sec.title}
                  </ThemedText>

                  {sec.items.map((it) => {
                    // custom block item
                    if (it.render) {
                      return (
                        <View key={it.key} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                          {it.render()}
                        </View>
                      );
                    }

                    // normal press item
                    const disabled = isCampaign && !draft;
                    return (
                      <Pressable
                        key={it.key}
                        onPress={disabled ? undefined : it.onPress}
                        style={({ pressed }) => [
                          styles.menuItem,
                          {
                            backgroundColor: pressed ? colors.pressed : "transparent",
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                      >
                        <View style={styles.menuItemRow}>
                          {it.emoji ? (
                            <ThemedText style={{ fontSize: 16, width: 22, textAlign: "center" }}>{it.emoji}</ThemedText>
                          ) : null}
                          <ThemedText
                            style={{
                              color: it.danger ? "#ff3b30" : colors.text,
                              fontSize: 15,
                              fontWeight: it.danger ? "700" : "500",
                              flex: 1,
                            }}
                          >
                            {it.label}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}

                  {idx < sections.length - 1 ? <View style={[styles.menuDivider, { backgroundColor: colors.border }]} /> : null}
                </View>
              ))}
            </ScrollView>

            {/* Cancel */}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.background },
              ]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>✕ Cancel</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  menuSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 8,
  },

  menuHeaderRow: { paddingHorizontal: 10, paddingTop: 2, paddingBottom: 6, gap: 2 },

  menuHeaderAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  topBar: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  doneBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  menuSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },

  menuItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },

  menuItemRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  menuDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginVertical: 8,
    marginHorizontal: 8,
  },

  cancelBtn: {
    marginTop: 8,
    marginHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  statsBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },

  stepBtn: {
    width: 44,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  pinBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },


});