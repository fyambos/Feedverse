// mobile/components/profile-edit/ProfileSettingsSection.tsx

import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { RowCard } from "@/components/ui/RowCard";
import { formatCount } from "@/lib/format";
import {
  MAX_COUNT_DIGITS,
  digitsOnly,
  limitCountText,
  pickFollowersForSize,
  pickFollowingBelowFollowers,
} from "@/lib/profileForm";

export function ProfileSettingsSection({
  colors,

  isPublic,
  setIsPublic,
  isPrivate,
  setIsPrivate,

  followersText,
  setFollowersText,
  followingText,
  setFollowingText,

  joinedDate,
  setJoinedDate,

  location,
  setLocation,
  link,
  setLink,

  maxLocation,
  maxLink,
}: {
  colors: any;

  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;

  followersText: string;
  setFollowersText: (v: string) => void;
  followingText: string;
  setFollowingText: (v: string) => void;

  joinedDate: Date;
  setJoinedDate: (d: Date) => void;

  location: string;
  setLocation: (v: string) => void;
  link: string;
  setLink: (v: string) => void;

  maxLocation: number;
  maxLink: number;
}) {
  const [showJoinedPicker, setShowJoinedPicker] = React.useState(false);

  const setAccountSize = (size: "small" | "mid" | "big") => {
    const followers = pickFollowersForSize(size);
    const following = pickFollowingBelowFollowers(followers);
    setFollowersText(String(followers));
    setFollowingText(String(following));
  };

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Profile settings</ThemedText>

      <RowCard
        label="Shared"
        colors={colors}
        right={
          <Switch
            value={!!isPublic}
            onValueChange={(v) => setIsPublic(!!v)}
            trackColor={{ false: colors.border, true: colors.tint }}
            thumbColor={Platform.OS === "android" ? colors.background : undefined}
          />
        }
      >
        <ThemedText style={{ color: colors.textSecondary }}>Other players can use this profile</ThemedText>
      </RowCard>

      <RowCard
        label="Private account"
        colors={colors}
        right={
          <Switch
            value={!!isPrivate}
            onValueChange={(v) => setIsPrivate(!!v)}
            trackColor={{ false: colors.border, true: colors.tint }}
            thumbColor={Platform.OS === "android" ? colors.background : undefined}
          />
        }
      >
        <ThemedText style={{ color: colors.textSecondary }}>Show a lock icon</ThemedText>
      </RowCard>

      <RowCard
        label="Account size"
        colors={colors}
        right={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setAccountSize("small")}
              hitSlop={10}
              style={({ pressed }) => [
                styles.sizeBtn,
                { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
              ]}
            >
              <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => setAccountSize("mid")}
              hitSlop={10}
              style={({ pressed }) => [
                styles.sizeBtn,
                { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
              ]}
            >
              <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => setAccountSize("big")}
              hitSlop={10}
              style={({ pressed }) => [
                styles.sizeBtn,
                { borderColor: colors.border, backgroundColor: pressed ? colors.pressed : "transparent" },
              ]}
            >
              <Ionicons name="people" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        }
      >
        <ThemedText style={{ color: colors.textSecondary }}>
          Tap an icon to generate followers & following
        </ThemedText>
      </RowCard>

      <RowCard
        label="Followings"
        colors={colors}
        right={
          followingText ? (
            <ThemedText style={{ color: colors.textSecondary }}>{formatCount(Number(followingText))}</ThemedText>
          ) : (
            <ThemedText style={{ color: colors.textSecondary, opacity: 0.4 }}>0</ThemedText>
          )
        }
      >
        <TextInput
          value={followingText}
          maxLength={MAX_COUNT_DIGITS}
          onChangeText={(v) => {
            const next = limitCountText(v);

            const f = Number(digitsOnly(followersText)) || 0;
            const g = Number(next || "0") || 0;

            if (f > 0 && next.length && g >= f) {
              setFollowingText(String(Math.max(0, f - 1)));
            } else {
              setFollowingText(next === "0" ? "" : next);
            }
          }}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          style={[styles.rowInput, { color: colors.text }]}
        />
      </RowCard>

      <RowCard
        label="Followers"
        colors={colors}
        right={
          followersText ? (
            <ThemedText style={{ color: colors.textSecondary }}>{formatCount(Number(followersText))}</ThemedText>
          ) : (
            <ThemedText style={{ color: colors.textSecondary, opacity: 0.4 }}>0</ThemedText>
          )
        }
      >
        <TextInput
          value={followersText}
          maxLength={MAX_COUNT_DIGITS}
          onChangeText={(v) => {
            const next = limitCountText(v);
            setFollowersText(next === "0" ? "" : next);

            const f = Number(next || "0") || 0;
            const g = Number(digitsOnly(followingText)) || 0;
            if (f > 0 && g >= f) setFollowingText(String(Math.max(0, f - 1)));
          }}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          style={[styles.rowInput, { color: colors.text }]}
        />
      </RowCard>

      {/* iOS picker inline */}
      {Platform.OS === "ios" && showJoinedPicker ? (
        <View style={[styles.pickerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.pickerHeader}>
            <ThemedText style={{ color: colors.textSecondary, fontWeight: "800" }}>Pick joined date</ThemedText>

            <Pressable
              onPress={() => setShowJoinedPicker(false)}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>Done</ThemedText>
            </Pressable>
          </View>

          <DateTimePicker
            value={joinedDate}
            mode="date"
            display="spinner"
            onChange={(_, selected) => {
              if (selected) setJoinedDate(selected);
            }}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      ) : null}

      <RowCard
        label="Joined date"
        colors={colors}
        right={
          <Pressable
            onPress={() => setShowJoinedPicker((v) => !v)}
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText style={{ color: colors.tint, fontWeight: "900" }}>
              {joinedDate.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
            </ThemedText>
          </Pressable>
        }
      >
        <ThemedText style={{ color: colors.textSecondary }}>Tap the date to change it</ThemedText>
      </RowCard>

      {Platform.OS === "android" && showJoinedPicker ? (
        <DateTimePicker
          value={joinedDate}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowJoinedPicker(false);
            if (selected) setJoinedDate(selected);
          }}
        />
      ) : null}

      <RowCard label="Location" colors={colors}>
        <TextInput
          value={location}
          maxLength={maxLocation}
          onChangeText={(v) => setLocation(v.slice(0, maxLocation))}
          placeholder="e.g. paris, france"
          placeholderTextColor={colors.textSecondary}
          style={[styles.rowInput, { color: colors.text }]}
        />
      </RowCard>

      <RowCard label="Link" colors={colors}>
        <TextInput
          value={link}
          maxLength={maxLink}
          onChangeText={(v) => setLink(v.slice(0, maxLink))}
          placeholder="e.g. https://..."
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          style={[styles.rowInput, { color: colors.text }]}
        />
      </RowCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  rowInput: {
    fontSize: 16,
    paddingVertical: 0,
  },
  sizeBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
  },
});