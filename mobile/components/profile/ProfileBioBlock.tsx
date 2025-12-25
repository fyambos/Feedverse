// mobile/components/profile/ProfileBioBlock.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import type { Profile } from "@/data/db/schema";
import type { ProfileViewState } from "@/components/profile/profileTypes";

type ColorsLike = {
  text: string;
  textSecondary: string;
};

type Props = {
  colors: ColorsLike;
  profile: Profile;

  viewState?: ProfileViewState;

  showStats?: boolean;
  forceStats?: { following: number; followers: number };

  showLockOnName?: boolean;
};

export function ProfileBioBlock({
  colors,
  profile,
  showStats = true,
  forceStats,
  showLockOnName,
}: Props) {
  const following =
    typeof forceStats?.following === "number"
      ? forceStats.following
      : Number(profile.followingCount ?? 0);

  const followers =
    typeof forceStats?.followers === "number"
      ? forceStats.followers
      : Number((profile as any).followerCount ?? (profile as any).followersCount ?? 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.nameRow}>
        <ThemedText type="defaultSemiBold" style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
          {profile.displayName}
        </ThemedText>

        {showLockOnName ? (
          <Ionicons name="lock-closed" size={16} color={colors.textSecondary} style={{ marginLeft: 6, marginTop: 2 }} />
        ) : null}
      </View>

      <ThemedText style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
        @{profile.handle}
      </ThemedText>

      {!!profile.bio ? (
        <ThemedText style={[styles.bio, { color: colors.text }]}>{profile.bio}</ThemedText>
      ) : null}

      {showStats ? (
        <View style={styles.statsRow}>
          <ThemedText style={{ color: colors.text }}>
            <ThemedText type="defaultSemiBold">{following}</ThemedText>{" "}
            <ThemedText style={{ color: colors.textSecondary }}>Following</ThemedText>
          </ThemedText>

          <ThemedText style={{ color: colors.text }}>
            <ThemedText type="defaultSemiBold">{followers}</ThemedText>{" "}
            <ThemedText style={{ color: colors.textSecondary }}>Followers</ThemedText>
          </ThemedText>
        </View>
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
  statsRow: { marginTop: 12, flexDirection: "row", gap: 14 },
});
