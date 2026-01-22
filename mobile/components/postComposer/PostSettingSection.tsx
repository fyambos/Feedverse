import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { RowCard } from "@/components/ui/RowCard";
import { formatCount } from "@/lib/utils/format";

import { MAX_COUNT_DIGITS } from "@/lib/postComposer/counts";

export function PostSettingsSection({
  colors,
  date,
  onOpenPicker,
  showDatePicker,
  pickerMode,
  onAndroidPickerChange,

  counts,
  replyCount,
  repostCount,
  likeCount,
  onChangeReplyCount,
  onChangeRepostCount,
  onChangeLikeCount,

  onPresetFew,
  onPresetMid,
  onPresetLot,
}: {
  colors: any;

  date: Date;
  onOpenPicker: (mode: "date" | "time") => void;

  showDatePicker: boolean;
  pickerMode: "date" | "time";
  onAndroidPickerChange: (selected?: Date) => void;

  counts: { reply: number; repost: number; like: number };
  replyCount: string;
  repostCount: string;
  likeCount: string;
  onChangeReplyCount: (v: string) => void;
  onChangeRepostCount: (v: string) => void;
  onChangeLikeCount: (v: string) => void;

  onPresetFew: () => void;
  onPresetMid: () => void;
  onPresetLot: () => void;
}) {
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        Post settings
      </ThemedText>

      <RowCard label="Date" colors={colors}>
        <View style={styles.dateRow}>
          <Pressable onPress={() => onOpenPicker("date")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
              {date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => onOpenPicker("time")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText style={{ color: colors.tint, fontWeight: "700" }}>
              {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </ThemedText>
          </Pressable>
        </View>
      </RowCard>

      <RowCard label="Engagement" colors={colors}>
        <View style={styles.presetRow}>
          <Pressable onPress={onPresetFew} hitSlop={8} style={({ pressed }) => [styles.presetBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="person-outline" size={18} color={colors.text} />
            <ThemedText style={{ color: colors.text, fontWeight: "700" }}>few</ThemedText>
          </Pressable>

          <Pressable onPress={onPresetMid} hitSlop={8} style={({ pressed }) => [styles.presetBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="people-outline" size={18} color={colors.text} />
            <ThemedText style={{ color: colors.text, fontWeight: "700" }}>mid</ThemedText>
          </Pressable>

          <Pressable onPress={onPresetLot} hitSlop={8} style={({ pressed }) => [styles.presetBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="rocket-outline" size={18} color={colors.text} />
            <ThemedText style={{ color: colors.text, fontWeight: "700" }}>lot</ThemedText>
          </Pressable>
        </View>
      </RowCard>

      <View style={styles.rowGrid}>
        <View style={{ flex: 1 }}>
          <RowCard
            label="Replies"
            colors={colors}
            right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.reply)}</ThemedText>}
          >
            <TextInput
              value={replyCount}
              maxLength={MAX_COUNT_DIGITS}
              onChangeText={onChangeReplyCount}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.rowInput, { color: colors.text }]}
              selectionColor={colors.tint}
            />
          </RowCard>
        </View>

        <View style={{ flex: 1 }}>
          <RowCard
            label="Reposts"
            colors={colors}
            right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.repost)}</ThemedText>}
          >
            <TextInput
              value={repostCount}
              maxLength={MAX_COUNT_DIGITS}
              onChangeText={onChangeRepostCount}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.rowInput, { color: colors.text }]}
              selectionColor={colors.tint}
            />
          </RowCard>
        </View>
      </View>

      <RowCard
        label="Likes"
        colors={colors}
        right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.like)}</ThemedText>}
      >
        <TextInput
          value={likeCount}
          maxLength={MAX_COUNT_DIGITS}
          onChangeText={onChangeLikeCount}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={[styles.rowInput, { color: colors.text }]}
          selectionColor={colors.tint}
        />
      </RowCard>

      {showDatePicker && Platform.OS !== "ios" ? (
        <DateTimePicker
          value={date}
          mode={pickerMode}
          display="default"
          onChange={(_, selected) => onAndroidPickerChange(selected)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  dateRow: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  presetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  rowGrid: { flexDirection: "row", gap: 10 },
  rowInput: { fontSize: 16, paddingVertical: 0 },
});