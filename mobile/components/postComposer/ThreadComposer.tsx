import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";

function isTruthyText(s: string) {
  return (s ?? "").trim().length > 0;
}

export function ThreadComposer({
  colors,
  isEdit,
  parentId,
  quoteId,
  threadTexts,
  imageUrls,
  videoThumbUri,
  focusedThreadIndex,
  setFocusedThreadIndex,
  onChangeThreadTextAt,
  onAddThreadItem,
  onRemoveThreadItem,
}: {
  colors: any;
  isEdit: boolean;
  parentId?: string;
  quoteId?: string;

  threadTexts: string[];
  imageUrls?: string[];
  videoThumbUri?: string | null;
  focusedThreadIndex: number;
  setFocusedThreadIndex: (idx: number) => void;

  onChangeThreadTextAt: (idx: number, value: string) => void;
  onAddThreadItem: () => void;
  onRemoveThreadItem: (idx: number) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      {threadTexts.map((value, idx) => {
        const isLast = idx === threadTexts.length - 1;
        const canRemove = !isEdit && !parentId && !quoteId && threadTexts.length > 1;

        const lastIdx = Math.max(0, threadTexts.length - 1);
        const lastHasText = isTruthyText(threadTexts[lastIdx] ?? "");
        const lastHasMedia =
          lastIdx === 0 && ((Array.isArray(imageUrls) && imageUrls.length > 0) || Boolean(videoThumbUri));
        const lastIsReady = lastHasText || lastHasMedia;

        return (
          <View key={`thread_${idx}`} style={styles.threadItemWrap}>
            {canRemove ? (
              <Pressable
                onPress={() => onRemoveThreadItem(idx)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.threadRemoveFloat,
                  {
                    opacity: pressed ? 0.6 : 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            ) : null}

            <TextInput
              value={value}
              onChangeText={(v) => onChangeThreadTextAt(idx, v)}
              onFocus={() => setFocusedThreadIndex(idx)}
              placeholder={idx === 0 ? "What’s happening?" : "Add another post"}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.input,
                { color: colors.text, paddingRight: canRemove ? 34 : 0 },
              ]}
              selectionColor={colors.tint}
              maxLength={500}
              scrollEnabled
              textAlignVertical="top"
            />

            <View style={styles.threadFooterRow}>
              <View style={{ flex: 1 }} />

              {focusedThreadIndex === idx ? (
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {value.length}/500
                </ThemedText>
              ) : null}

              {!isEdit && !parentId && !quoteId && isLast ? (
                <Pressable
                  onPress={onAddThreadItem}
                  disabled={!lastIsReady}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.threadPlusTiny,
                    {
                      opacity: !lastIsReady ? 0.35 : pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Ionicons name="add" size={16} color={colors.tint} />
                </Pressable>
              ) : null}
            </View>

            {!isLast ? (
              <View style={[styles.threadDividerFull, { backgroundColor: colors.border }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  threadItemWrap: { width: "100%", alignSelf: "stretch", position: "relative" },
  input: {
    fontSize: 19,
    lineHeight: 24,
    paddingTop: 2,
    paddingBottom: 6,
    minHeight: 0,
    maxHeight: 260,
    width: "100%",
    alignSelf: "stretch",
  },
  threadRemoveFloat: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  threadFooterRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  threadDividerFull: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
    marginTop: 12,
    width: "auto",
    alignSelf: "stretch",
    marginLeft: -(42 + 12),
  },
  threadPlusTiny: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});