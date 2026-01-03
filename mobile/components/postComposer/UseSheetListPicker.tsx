import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  background: string;
  border: string;
  pressed: string;
  text: string;
  textSecondary: string;
  tint?: string;
};

export type SheetListItem = { id: string; name: string; qty?: number; notes?: string };

type Props = {
  colors: ColorsLike;
  title: string;
  subtitle?: string;
  items: SheetListItem[];
  disabled?: boolean;
  onConfirm: (selectedIds: string[]) => void;

  variant?: "default" | "icon";
  icon?: string;
  buttonLabel?: string;
  accessibilityLabel?: string;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

export function UseSheetListPicker({
  colors,
  title,
  subtitle,
  items,
  disabled,
  onConfirm,
  variant = "icon",
  icon = "✨",
  buttonLabel = "",
  accessibilityLabel = title,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});

  const safeItems = React.useMemo(() => {
    return (Array.isArray(items) ? items : [])
      .map((it) => {
        const id = norm(it?.id);
        const name = norm(it?.name);
        const notes = norm(it?.notes);
        const qty = typeof (it as any)?.qty === "number" ? Math.max(0, Math.floor((it as any).qty)) : undefined;
        return { ...it, id, name, notes: notes || undefined, qty };
      })
      .filter((it) => !!it.id && !!it.name);
  }, [items]);

  const canOpen = !disabled && safeItems.length > 0;

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const close = React.useCallback(() => setOpen(false), []);
  const reset = React.useCallback(() => setSelected({}), []);

  const selectedIds = React.useMemo(() => {
    return Object.entries(selected)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }, [selected]);

  const confirm = React.useCallback(() => {
    if (!selectedIds.length) return;
    onConfirm(selectedIds);
    close();
    reset();
  }, [selectedIds, onConfirm, close, reset]);

  return (
    <>
      {variant === "icon" ? (
        <Pressable
          disabled={!canOpen}
          onPress={() => setOpen(true)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: pressed ? colors.pressed : "transparent",
              opacity: canOpen ? 1 : 0.5,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <ThemedText style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{icon}</ThemedText>
        </Pressable>
      ) : (
        <Pressable
          disabled={!canOpen}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.useBtn,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.pressed : "transparent",
              opacity: canOpen ? 1 : 0.5,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <ThemedText style={{ color: colors.text, fontWeight: "900" }}>
            {icon} {buttonLabel}
          </ThemedText>
        </Pressable>
      )}

      <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            onPress={() => {}}
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <ThemedText style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{title}</ThemedText>
            {subtitle ? (
              <ThemedText style={{ color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>{subtitle}</ThemedText>
            ) : null}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 6 }}>
              {safeItems.map((it) => {
                const isOn = !!selected[it.id];
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => toggle(it.id)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.pressed : "transparent",
                      },
                    ]}
                  >
                    <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isOn ? colors.pressed : "transparent" }]}>
                      {isOn ? <ThemedText style={{ color: colors.text, fontWeight: "900" }}>✓</ThemedText> : null}
                    </View>

                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                        {it.name}
                      </ThemedText>
                      {it.notes ? (
                        <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
                          {it.notes}
                        </ThemedText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.btnRow}>
              <Pressable
                onPress={() => {
                  close();
                  reset();
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: "900" }}>cancel</ThemedText>
              </Pressable>

              <Pressable
                disabled={!selectedIds.length}
                onPress={confirm}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : "transparent",
                    opacity: selectedIds.length ? 1 : 0.5,
                  },
                ]}
              >
                <ThemedText style={{ color: colors.tint ?? colors.text, fontWeight: "900" }}>add ({selectedIds.length})</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  useBtn: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
  },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.9, marginTop: 10, marginBottom: 10 },

  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  btnRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
