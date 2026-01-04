import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  ScrollView,
  Platform,
  useColorScheme as useNativeColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";

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
  /** Opt-in; default styling should match your RowCard (neutral card). */
  useGradient?: boolean;
};

export function AppDialogModal({
  visible,
  title,
  message,
  buttons,
  onRequestClose,
  input,
  useGradient = false,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();

  const scheme = useNativeColorScheme() ?? "light";
  const colors = Colors[scheme];

  const pressedRowBg = colors.pressed;
  const backdropBg = colors.modalBackdrop;

  // backdrop padding = 24 left + 24 right
  const available = Math.max(0, screenWidth - 48);
  const targetMax = screenWidth >= 768 ? 520 : 440; // wider on tablets, slightly wider on phones
  const cardWidth = Math.min(available, targetMax);

  // Optional gradient support (ONLY if explicitly enabled)
  let LinearGradient: any = null;
  if (useGradient) {
    try {
      LinearGradient = require("expo-linear-gradient")?.LinearGradient ?? null;
    } catch {
      LinearGradient = null;
    }
  }

  const CardContainer: any = LinearGradient ? LinearGradient : View;
  const cardContainerProps = LinearGradient
    ? {
        colors: [colors.card, colors.background],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      }
    : {};

  const getActionStyle = (variant: AppDialogButton["variant"]) => {
    if (variant === "destructive") {
      return { textColor: "#ff3b30", iconColor: "#ff3b30" };
    }
    if (variant === "cancel") {
      return { textColor: colors.text, iconColor: colors.textSecondary };
    }
    // default: neutral (NOT tint)
    return { textColor: colors.text, iconColor: colors.textSecondary };
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Pressable style={[styles.backdrop, { backgroundColor: backdropBg }]} onPress={onRequestClose}>
        <Pressable onPress={(e) => e?.stopPropagation?.()}>
          <CardContainer
            {...cardContainerProps}
            style={[
              styles.card,
              {
                width: cardWidth,
                borderColor: colors.border,
                backgroundColor: LinearGradient ? undefined : colors.card,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                {!!title && (
                  <ThemedText style={[styles.title, { color: colors.textSecondary }]}>
                    {String(title).toUpperCase()}
                  </ThemedText>
                )}
              </View>

              {onRequestClose ? (
                <Pressable
                  onPress={onRequestClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  hitSlop={10}
                  style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            {!!message && (
              <ScrollView
                style={styles.messageScroll}
                contentContainerStyle={styles.messageScrollContent}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                <ThemedText style={[styles.message, { color: colors.text }]}>
                  {message}
                </ThemedText>
              </ScrollView>
            )}

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
                    backgroundColor: colors.card, // was colors.background
                  },
                ]}
              />
            ) : null}

            <View
              style={[
                styles.actionsWrap,
                {
                  borderTopColor: colors.border,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              {buttons.map((b, idx) => {
                const variant = b.variant ?? "default";
                const v = getActionStyle(variant);

                return (
                  <Pressable
                    key={`${b.text}-${idx}`}
                    onPress={b.onPress}
                    style={({ pressed }) => [
                      styles.actionRow,
                      idx > 0 && {
                        borderTopColor: colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      },
                      pressed && { backgroundColor: pressedRowBg },
                    ]}
                    android_ripple={Platform.OS === "android" ? { color: pressedRowBg } : undefined}
                    accessibilityRole="button"
                  >
                    {b.icon?.name ? (
                      <Ionicons
                        name={b.icon.name}
                        size={b.icon.size ?? 18}
                        color={b.icon.color ?? v.iconColor}
                        style={styles.actionIcon}
                      />
                    ) : null}

                    <ThemedText style={[styles.actionText, { color: v.textColor }]}>
                      {b.text}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </CardContainer>
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
    // backgroundColor is now set inline per theme
  },
  card: {
    alignSelf: "center",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",

    // soften shadow to feel like a RowCard, not a floating modal button
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "left",
    letterSpacing: 2.6,
    opacity: 0.9,
  },

  messageScroll: { maxHeight: 240 },
  messageScrollContent: { paddingTop: 2 },
  message: {
    fontSize: 15,
    opacity: 0.92,
    textAlign: "left",
    lineHeight: 20,
  },

  textInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  // Full-width action rows with separators (modern “sheet” style)
  actionsWrap: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  actionRow: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionIcon: { marginTop: 1 },
  actionText: {
    fontSize: 13,       // tinier
    letterSpacing: 0.5,
    fontWeight: "700",  // bold options
  },
});