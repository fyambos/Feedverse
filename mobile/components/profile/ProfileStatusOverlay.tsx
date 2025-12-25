// mobile/components/profile/ProfileStatusOverlay.tsx
import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  background: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  pressed: string;
};

type Props = {
  visible: boolean;
  colors: ColorsLike;
  title: string;
  message: string;
  onClose: () => void;
};

export function ProfileStatusOverlay({ visible, colors, title, message, onClose }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
            {title}
          </ThemedText>

          <ThemedText style={{ color: colors.textSecondary, marginTop: 8, lineHeight: 18 }}>
            {message}
          </ThemedText>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: pressed ? colors.pressed : "transparent", borderColor: colors.border },
            ]}
          >
            <ThemedText style={{ color: colors.text, fontWeight: "800" }}>OK</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  btn: {
    marginTop: 14,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
