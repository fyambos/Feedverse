// mobile/components/profile/ProfileBioBlock.tsx
import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Fontisto, Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import type { Profile } from "@/data/db/schema";
import type { ProfileViewState } from "@/components/profile/profileTypes";
import { formatCount, formatJoined, normalizeUrl, displayUrl } from "@/lib/utils/format";

type ColorsLike = {
  text: string;
  textSecondary: string;
  textMuted?: string;
  tint?: string;
  border?: string;
  card?: string;
  pressed?: string;
};

type Props = {
  colors: ColorsLike;
  profile: Profile;

  viewState?: ProfileViewState;

  showStats?: boolean;
  forceStats?: { following: number; followers: number };

  showLockOnName?: boolean;

  showCharacterSheetButton?: boolean;
  onPressCharacterSheet?: () => void;
};

export function ProfileBioBlock({
  colors,
  profile,
  showStats = true,
  forceStats,
  showLockOnName,
  showCharacterSheetButton = false,
  onPressCharacterSheet,
}: Props) {
  const following =
    typeof forceStats?.following === "number"
      ? forceStats.following
      : Number(profile.followingCount ?? 0);

  const followers =
    typeof forceStats?.followers === "number"
      ? forceStats.followers
      : Number((profile as any).followerCount ?? (profile as any).followersCount ?? 0);

  const location = useMemo(() => String(profile.location ?? "").trim(), [profile.location]);

  const linkRaw = useMemo(() => String(profile.link ?? "").trim(), [profile.link]);
  const linkHref = useMemo(() => normalizeUrl(linkRaw), [linkRaw]);
  const linkLabel = useMemo(() => displayUrl(linkRaw), [linkRaw]);

  const joinedRaw = useMemo(
    () => String((profile.joinedDate ?? profile.createdAt ?? "") as any).trim(),
    [profile.joinedDate, profile.createdAt]
  );
  const joinedLabel = useMemo(() => (joinedRaw ? formatJoined(joinedRaw) : null), [joinedRaw]);

  const onOpenLink = async () => {
    if (!linkHref) return;
    const can = await Linking.canOpenURL(linkHref);
    if (!can) return;
    Linking.openURL(linkHref);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.nameRow}>
        <ThemedText
          type="defaultSemiBold"
          style={[styles.displayName, { color: colors.text }]}
          numberOfLines={1}
        >
          {profile.displayName}
        </ThemedText>

        {showLockOnName ? (
          <Fontisto name="locked" size={16} color={colors.text} style={{ marginLeft: 6, marginTop: 2 }} />
        ) : null}
      </View>

      <ThemedText style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
        @{profile.handle}
      </ThemedText>

      {!!profile.bio ? (
        <ThemedText style={[styles.bio, { color: colors.text }]}>{profile.bio}</ThemedText>
      ) : null}

      {/* NEW: meta (location + link on same row, joined under) */}
      {(!!location || !!linkHref || !!joinedLabel) && (
        <View style={styles.metaBlock}>
          {(!!location || !!linkHref) && (
            <View style={styles.metaRow}>
              {!!location ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                  <ThemedText
                    style={[styles.metaText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {location}
                  </ThemedText>
                </View>
              ) : null}

              {!!linkHref ? (
                <Pressable
                  onPress={onOpenLink}
                  hitSlop={8}
                  style={({ pressed }) => [styles.metaItem, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="link-outline" size={16} color={colors.textSecondary} />
                  <ThemedText
                    style={[
                      styles.metaText,
                      {
                        color: colors.tint ?? colors.textSecondary,
                        textDecorationLine: "underline",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {linkLabel}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}

          {!!joinedLabel && (
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <ThemedText style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  Joined {joinedLabel}
                </ThemedText>
              </View>
            </View>
          )}
        </View>
      )}

      {showStats ? (
        <View style={styles.statsRow}>
          <ThemedText style={{ color: colors.text }}>
            <ThemedText type="defaultSemiBold">{formatCount(following)}</ThemedText>{" "}
            <ThemedText style={{ color: colors.textSecondary }}>Following</ThemedText>
          </ThemedText>

          <ThemedText style={{ color: colors.text }}>
            <ThemedText type="defaultSemiBold">{formatCount(followers)}</ThemedText>{" "}
            <ThemedText style={{ color: colors.textSecondary }}>Followers</ThemedText>
          </ThemedText>
        </View>
      ) : null}
      
      {showCharacterSheetButton ? (
        <Pressable
          onPress={onPressCharacterSheet}
          hitSlop={10}
          style={({ pressed }) => [
            styles.sheetBtn,
            {
              borderColor: colors.border ?? "rgba(0,0,0,0.12)",
              backgroundColor: pressed ? (colors.pressed ?? "rgba(0,0,0,0.06)") : (colors.card ?? "transparent"),
            },
          ]}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.text} />
          <ThemedText style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>
            character sheet
          </ThemedText>
        </Pressable>
      ) : null}
      
    </View>

    
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", maxWidth: "100%" },
  displayName: { fontSize: 22, lineHeight: 26, maxWidth: "92%" },
  handle: { marginTop: 2, fontSize: 15, opacity: 0.95 },
  bio: { marginTop: 10, fontSize: 15, lineHeight: 20 },

  metaBlock: { marginTop: 10, gap: 6 },

  // row that can hold two items (location + link)
  metaRow: { flexDirection: "row", alignItems: "center", gap: 14 },

  // an item is icon + text
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 },

  metaText: { fontSize: 14, opacity: 0.95, flexShrink: 1 },

  statsRow: { marginTop: 12, flexDirection: "row", gap: 14 },

  sheetBtn: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
  },
});