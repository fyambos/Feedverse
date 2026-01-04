import React from "react";
import { Modal, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type AppDialogButton = {
  text: string;
  variant?: "default" | "cancel" | "destructive";
  onPress: () => void;
  icon?: {
    name: React.ComponentProps<typeof Ionicons>["name"];
    color?: string;
    size?: number;
  };
};

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  buttons: AppDialogButton[];
  onRequestClose?: () => void;
  input?: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
    secureTextEntry?: boolean;
    autoFocus?: boolean;
  };
};

export function AppDialogModal({
  visible,
  title,
  message,
  buttons,
  onRequestClose,
  input,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const twoButtons = buttons.length === 2;

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  // backdrop padding = 24 left + 24 right
  const available = Math.max(0, screenWidth - 48);
  const targetMax = screenWidth >= 768 ? 520 : 440; // wider on tablets, slightly wider on phones
  const cardWidth = Math.min(available, targetMax);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable onPress={(e) => e?.stopPropagation?.()}>
          <ThemedView style={[styles.card, { width: cardWidth }]}>
            {!!title && <ThemedText style={styles.title}>{title}</ThemedText>}
            {!!message && <ThemedText style={styles.message}>{message}</ThemedText>}

            {input ? (
              <TextInput
                value={input.value}
                onChangeText={input.onChangeText}
                placeholder={input.placeholder}
                placeholderTextColor={colors.textSecondary}
                autoFocus={input.autoFocus}
                keyboardType={input.keyboardType}
                secureTextEntry={input.secureTextEntry}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
              />
            ) : null}

            <View style={[styles.buttons, twoButtons && styles.buttonsRow]}>
              {buttons.map((b, idx) => (
                <Pressable
                  key={`${b.text}-${idx}`}
                  onPress={b.onPress}
                  style={({ pressed }) => [
                    styles.button,
                    twoButtons && styles.buttonRowItem,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                >
                  {b.icon?.name ? (
                    <Ionicons
                      name={b.icon.name}
                      size={b.icon.size ?? 18}
                      color={b.icon.color}
                      style={styles.buttonIcon}
                    />
                  ) : null}

                  <ThemedText
                    style={[
                      styles.buttonText,
                      b.variant === "cancel" && styles.cancelText,
                      b.variant === "destructive" && styles.destructiveText,
                    ]}
                  >
                    {b.text}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  card: {
    alignSelf: "center",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 14, opacity: 0.9, textAlign: "center", lineHeight: 20 },

  textInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  buttons: { marginTop: 6, gap: 8 },
  buttonsRow: { flexDirection: "row" },

  button: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonRowItem: { flex: 1 },

  buttonPressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  cancelText: { opacity: 0.9 },
  destructiveText: { color: "#ff3b30" },
  buttonIcon: { marginTop: 1 },
});