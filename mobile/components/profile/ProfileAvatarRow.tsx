// mobile/components/profile/ProfileAvatarRow.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "@/components/ui/Avatar";
import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  background: string;
  border: string;
  card: string;
  pressed: string;
  text: string;
};

type PrimaryButtonOverride = {
  label: string;
  // "primary" keeps your original Follow styling
  // "danger" makes it twitter-like outlined red for Blocked
  variant?: "primary" | "danger";
};

type Props = {
  colors: ColorsLike;
  avatarUri: string | null;
  showCameras: boolean;
  picking: boolean;

  onOpenAvatarLightbox: () => void;
  onChangeAvatar?: () => void;

  editMode: boolean;
  onPressPrimary: () => void;
  onLongPressPrimary: () => void;

  primaryButtonOverride?: PrimaryButtonOverride;
};

export function ProfileAvatarRow({
  colors,
  avatarUri,
  showCameras,
  picking,
  onOpenAvatarLightbox,
  onChangeAvatar,
  editMode,
  onPressPrimary,
  onLongPressPrimary,
  primaryButtonOverride,
}: Props) {
  const overrideLabel = primaryButtonOverride?.label;
  const overrideVariant = primaryButtonOverride?.variant ?? "primary";

  const dangerRed = "#ff3b30";

  const primaryLabel = overrideLabel ?? "Follow";

  const isDanger = overrideVariant === "danger";

  return (
    <View style={styles.avatarRow}>
      <View style={[styles.avatarOuter, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={onOpenAvatarLightbox}
          onLongPress={showCameras ? onChangeAvatar : undefined}
          delayLongPress={250}
        >
          <Avatar uri={avatarUri} size={80} fallbackColor={colors.border} />
        </Pressable>

        {showCameras ? (
          <Pressable
            onPress={onChangeAvatar}
            disabled={picking}
            hitSlop={12}
            style={({ pressed }) => [
              styles.avatarEditBadge,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && styles.pressedPop,
              picking && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change avatar"
          >
            <Ionicons name="camera" size={16} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1 }} />

      {editMode ? (
        <Pressable
          onPress={onPressPrimary}
          onLongPress={onLongPressPrimary}
          delayLongPress={250}
          style={({ pressed }) => [
            styles.ghostBtn,
            { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : colors.background },
          ]}
        >
          <ThemedText style={{ fontWeight: "700", color: colors.text }}>Edit profile</ThemedText>
        </Pressable>
      ) : (
        <Pressable
          onPress={onPressPrimary}
          onLongPress={onLongPressPrimary}
          delayLongPress={250}
          style={({ pressed }) => [
            styles.primaryBtn,
            // ✅ primary vs danger styling
            isDanger
              ? {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: dangerRed,
                }
              : {
                  backgroundColor: colors.text,
                  borderWidth: 0,
                },
            pressed && { opacity: 0.85 },
          ]}
        >
          <ThemedText
            style={{
              fontWeight: "800",
              color: isDanger ? dangerRed : colors.background,
            }}
          >
            {primaryLabel}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRow: { marginTop: -26, paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  avatarOuter: { width: 88, height: 88, borderRadius: 999, padding: 4 },
  avatarEditBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    zIndex: 20,
    elevation: 20,
  },

  ghostBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  pressedPop: { transform: [{ scale: 0.92 }] },
});
