import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/themed-text";

type RowCardProps = {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  colors: any;
};

export function RowCard({ label, children, right, colors }: RowCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </ThemedText>
        {children}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  right: {
    marginLeft: 12,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
