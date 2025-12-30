// mobile/app/(scenario)/[scenarioId]/(tabs)/sheet/[profileId].tsx

import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>{title}</ThemedText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value?: any; colors: any }) {
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
      <ThemedText style={[styles.rowValue, { color: colors.text }]} numberOfLines={2}>
        {value ?? "—"}
      </ThemedText>
    </View>
  );
}

function Locked({ colors, text = "Private" }: { colors: any; text?: string }) {
  return (
    <View style={[styles.locked, { borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
      <ThemedText style={{ color: colors.textSecondary, fontWeight: "700" }}>{text}</ThemedText>
    </View>
  );
}

export default function CharacterSheetScreen() {
  
  // Params
  const { scenarioId, profileId } = useLocalSearchParams<{ scenarioId: string; profileId: string }>();

  // Theme
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  // Decode params
  const sid = decodeURIComponent(String(scenarioId ?? ""));
  const pid = decodeURIComponent(String(profileId ?? ""));

  // Contexts
  const { userId } = useAuth();
  const { isReady, getScenarioById, getProfileById, getCharacterSheetByProfileId } = useAppData() as any;

  // Load scenario, profile, and sheet data
  const scenario = useMemo(() => getScenarioById?.(sid) ?? null, [sid, getScenarioById]);
  const profile = useMemo(() => getProfileById?.(pid) ?? null, [pid, getProfileById]);
  const sheet = useMemo(() => getCharacterSheetByProfileId?.(pid) ?? null, [pid, getCharacterSheetByProfileId]);

  // Is this scenario a campaign?
  const isCampaign = String((scenario as any)?.mode ?? "story") === "campaign";

  // Is the viewer the owner of this profile?
  const isOwner = useMemo(() => {
    if (!profile || !userId) return false;
    return String((profile as any).ownerUserId ?? "") === String(userId);
  }, [profile, userId]);

  // Is the viewer a GM in this scenario?
  const isGm = useMemo(() => {
    if (!scenario || !userId) return false;
    const gmIds: string[] = Array.isArray((scenario as any).gmUserIds)
      ? (scenario as any).gmUserIds.map(String)
      : [];
    return gmIds.includes(String(userId));
  }, [scenario, userId]);

  // Can the viewer see private sheet info?
  const canSeePrivate = isOwner || isGm;

  // Is this a public profile?
  const isPublicProfile = useMemo(() => {
    if (!profile) return false;
    if (typeof (profile as any).isPublic === "boolean") return Boolean((profile as any).isPublic);
    return (profile as any).isPrivate !== true;
  }, [profile]);

  // Can the viewer edit this sheet?
  const canEditSheet = isOwner || isPublicProfile;

  if (!isReady) {
    return (
      <ThemedView
        style={[
          styles.screen,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ThemedText style={{ color: colors.textSecondary }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={{ flex: 1, alignItems: "center" }}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
              Character Sheet
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {profile?.displayName ?? pid}
              {isCampaign ? " · Campaign" : ""}
            </ThemedText>
          </View>

          {canEditSheet ? (
            <Pressable
              onPress={() => {
                router.push({ pathname: `/modal/edit-sheet`, params: { scenarioId: sid, profileId: pid } } as any);
              }}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="create-outline" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {!sheet ? (
            <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
              <ThemedText style={{ color: colors.textSecondary, fontWeight: "700" }}>
                No character sheet for this profile
              </ThemedText>
            </View>
          ) : (
            <>
              {/* 🧾 Identity */}
              <Section title="🧾 Identity" colors={colors}>
                <Row label="Name" value={sheet.name} colors={colors} />
                <Row label="Race" value={sheet.race} colors={colors} />
                <Row label="Class" value={sheet.class} colors={colors} />
                <Row label="Level" value={sheet.level} colors={colors} />
                <Row label="Alignment" value={sheet.alignment} colors={colors} />

                <View style={styles.dividerWrap}>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                </View>

                <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                  Background
                </ThemedText>
                {canSeePrivate ? (
                  <ThemedText style={{ color: colors.text, lineHeight: 20 }}>
                    {sheet.background ?? "—"}
                  </ThemedText>
                ) : (
                  <Locked colors={colors} text="Private (Owner + GM)" />
                )}
              </Section>

              {/* 📊 Stats */}
              <Section title="📊 Stats" colors={colors}>
                <View style={styles.grid}>
                  {[
                    ["Strength", sheet.stats?.strength],
                    ["Dexterity", sheet.stats?.dexterity],
                    ["Constitution", sheet.stats?.constitution],
                    ["Intelligence", sheet.stats?.intelligence],
                    ["Wisdom", sheet.stats?.wisdom],
                    ["Charisma", sheet.stats?.charisma],
                  ].map(([k, v]) => (
                    <View
                      key={String(k)}
                      style={[
                        styles.statPill,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                    >
                      <ThemedText style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                        {String(k)}
                      </ThemedText>
                      <ThemedText style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>
                        {typeof v === "number" ? v : "—"}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </Section>

              {/* ❤️ Combat */}
              <Section title="❤️ Combat" colors={colors}>
                <Row
                  label="HP"
                  value={sheet.hp ? `${sheet.hp.current ?? "—"} / ${sheet.hp.max ?? "—"}` : "—"}
                  colors={colors}
                />
                <Row label="Max HP" value={sheet.hp?.max} colors={colors} />
                <Row label="Status" value={sheet.status ?? "—"} colors={colors} />
              </Section>

              {/* 🎒 Inventory */}
              <Section title="🎒 Inventory" colors={colors}>
                {canSeePrivate ? (
                  <>
                    <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                      Items
                    </ThemedText>
                    {(sheet.inventory ?? []).length ? (
                      (sheet.inventory ?? []).map((it: any) => (
                        <View key={String(it.id ?? it.name)} style={styles.listRow}>
                          <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                            {it.name}
                          </ThemedText>
                          <ThemedText style={{ color: colors.textSecondary }}>
                            {it.qty ? `x${it.qty}` : it.notes ? it.notes : ""}
                          </ThemedText>
                        </View>
                      ))
                    ) : (
                      <ThemedText style={{ color: colors.textSecondary }}>—</ThemedText>
                    )}

                    <View style={styles.dividerWrap}>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    </View>

                    <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                      Equipment
                    </ThemedText>
                    {(sheet.equipment ?? []).length ? (
                      (sheet.equipment ?? []).map((it: any) => (
                        <View key={String(it.id ?? it.name)} style={styles.listRow}>
                          <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                            {it.name}
                          </ThemedText>
                          <ThemedText style={{ color: colors.textSecondary }}>
                            {it.notes ?? ""}
                          </ThemedText>
                        </View>
                      ))
                    ) : (
                      <ThemedText style={{ color: colors.textSecondary }}>—</ThemedText>
                    )}
                  </>
                ) : (
                  <Locked colors={colors} text="Private (Owner + GM)" />
                )}
              </Section>

              {/* ✨ Abilities & Spells */}
              <Section title="✨ Abilities & Spells" colors={colors}>
                <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                  Abilities
                </ThemedText>
                {(sheet.abilities ?? []).length ? (
                  (sheet.abilities ?? []).map((a: any) => (
                    <View key={String(a.id ?? a.name)} style={styles.listRow}>
                      <ThemedText style={{ color: colors.text, fontWeight: "900" }}>
                        {a.name}
                      </ThemedText>
                      <ThemedText style={{ color: colors.textSecondary }}>
                        {a.notes ?? ""}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <ThemedText style={{ color: colors.textSecondary }}>—</ThemedText>
                )}

                <View style={styles.dividerWrap}>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                </View>

                <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                  Spells
                </ThemedText>
                {(sheet.spells ?? []).length ? (
                  (sheet.spells ?? []).map((s: any) => (
                    <View key={String(s.id ?? s.name)} style={styles.listRow}>
                      <ThemedText style={{ color: colors.text, fontWeight: "900" }}>
                        {s.name}
                      </ThemedText>
                      <ThemedText style={{ color: colors.textSecondary }}>
                        {s.notes ?? ""}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <ThemedText style={{ color: colors.textSecondary }}>—</ThemedText>
                )}
              </Section>

              {/* 📝 Notes */}
              <Section title="📝 Notes" colors={colors}>
                <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                  Public
                </ThemedText>
                <ThemedText style={{ color: colors.text, lineHeight: 20 }}>
                  {sheet.publicNotes ?? "—"}
                </ThemedText>

                <View style={styles.dividerWrap}>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                </View>

                <ThemedText style={[styles.blockLabel, { color: colors.textSecondary }]}>
                  Private
                </ThemedText>
                {canSeePrivate ? (
                  <ThemedText style={{ color: colors.text, lineHeight: 20 }}>
                    {sheet.privateNotes ?? "—"}
                  </ThemedText>
                ) : (
                  <Locked colors={colors} text="Private (Owner + GM)" />
                )}
              </Section>

              {!!sheet.updatedAt ? (
                <ThemedText
                  style={{ color: colors.textMuted ?? colors.textSecondary, fontSize: 12, marginTop: 6 }}
                >
                  Updated {new Date(sheet.updatedAt).toLocaleString()}
                </ThemedText>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  topBar: {
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  content: { padding: 16, paddingBottom: 28, gap: 14 },

  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "900" },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },

  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  rowLabel: { fontSize: 13, fontWeight: "800" },
  rowValue: { fontSize: 14, fontWeight: "800", flexShrink: 1, textAlign: "right" },

  blockLabel: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  dividerWrap: { paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.9 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  statPill: {
    width: "48%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },

  listRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },

  locked: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    opacity: 0.9,
  },
});