// mobile/components/postComposer/DateTimePickerOverlay.tsx
import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { ThemedText } from "@/components/themed-text";

export function DateTimePickerOverlay({
  colors,
  visible,
  mode,
  value,
  onChange,
  onClose,
}: {
  colors: any;
  visible: boolean;
  mode: "date" | "time";
  value: Date;
  onChange: (next: Date) => void;
  onClose: () => void;
}) {
  if (!visible || Platform.OS !== "ios") return null;

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        onPress={() => {}}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.header}>
          <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
            {mode === "date" ? "Choose date" : "Choose time"}
          </ThemedText>

          <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>Done</ThemedText>
          </Pressable>
        </View>

        <DateTimePicker
          value={value}
          mode={mode}
          display="spinner"
          onChange={(_, selected) => {
            if (selected) onChange(selected);
          }}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingBottom: 8,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});