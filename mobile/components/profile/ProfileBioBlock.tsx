// mobile/components/profile/ProfileBioBlock.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { formatCount, formatJoined } from "@/lib/format";
import type { Profile } from "@/data/db/schema";

type ColorsLike = {
  text: string;
  textSecondary: string;
  tint: string;
};

type Props = {
  colors: ColorsLike;
  profile: Profile;
};

export function ProfileBioBlock({ colors, profile }: Props) {
  return (
    <View style={styles.bioBlock}>
      <ThemedText type="defaultSemiBold" style={[styles.displayName, { color: colors.text }]}>
        {profile.displayName}
      </ThemedText>

      <ThemedText style={[styles.handle, { color: colors.textSecondary }]}>@{profile.handle}</ThemedText>

      {!!profile.bio && <ThemedText style={[styles.bio, { color: colors.text }]}>{profile.bio}</ThemedText>}

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
            {profile.location ?? "—"}
          </ThemedText>
        </View>

        <View style={styles.metaItem}>
          <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
          {profile.link ? (
            <ThemedText style={[styles.metaText, { color: colors.tint }]}>
              {profile.link.replace(/^https?:\/\//, "")}
            </ThemedText>
          ) : (
            <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>—</ThemedText>
          )}
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
            {profile.joinedDate ? formatJoined(profile.joinedDate) : "Joined"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.followsRow}>
        <ThemedText style={{ color: colors.text }}>
          <ThemedText type="defaultSemiBold">{formatCount(profile.followingCount ?? 0)}</ThemedText>{" "}
          <ThemedText style={{ color: colors.textSecondary }}>Following</ThemedText>
        </ThemedText>

        <ThemedText style={{ color: colors.text }}>
          <ThemedText type="defaultSemiBold">{formatCount(profile.followerCount ?? 0)}</ThemedText>{" "}
          <ThemedText style={{ color: colors.textSecondary }}>Followers</ThemedText>
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bioBlock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 6 },
  displayName: { fontSize: 20, fontWeight: "900", lineHeight: 24 },
  handle: { fontSize: 14, marginTop: -2 },
  bio: { fontSize: 15, lineHeight: 20, marginTop: 6 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 6, alignItems: "center" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13 },

  followsRow: { flexDirection: "row", gap: 16, marginTop: 8 },
});
