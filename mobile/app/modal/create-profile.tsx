import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile';
import { useAuth } from '@/context/auth';

export default function CreateProfileModal() {
  const { scenarioId, profileId } = useLocalSearchParams<{ scenarioId: string; profileId?: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const { createProfile, updateProfile, getUserProfilesForScenario, getProfileById } = useProfile();
  const { userId } = useAuth();

  const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=14';
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');

  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');

  // store as Date for proper picker UX; persist as ISO date string (YYYY-MM-DD)
  const [joinedDate, setJoinedDate] = useState<Date | null>(null);
  const [showJoinedPicker, setShowJoinedPicker] = useState(false);

  // numbers stored as text while typing, clamped on save
  const [following, setFollowing] = useState('');
  const [followers, setFollowers] = useState('');

  const MAX_COUNT = 99_000_000_000; // 99 billions
  const LIMITS = {
    displayName: 50,
    handle: 30,
    bio: 160,
    location: 30,
    link: 120,
  } as const;

  const sid = String(scenarioId ?? '');
  const isEdit = !!profileId;

  useEffect(() => {
    if (!isEdit) return;

    const pid = String(profileId ?? '');
    if (!pid) return;

    // Prefer a direct lookup (merged: AsyncStorage + mocks) if available.
    // Fallback to the list in case getProfileById isn't wired for some reason.
    const direct = typeof getProfileById === 'function' ? getProfileById(sid, pid) : null;
    const fallbackList = getUserProfilesForScenario(sid);
    const existing = (direct ?? fallbackList.find((p: any) => p.id === pid)) as any;

    if (!existing) return;

    setAvatarUrl(existing.avatarUrl || DEFAULT_AVATAR);
    setName(existing.displayName || '');
    setHandle(existing.handle || '');
    setBio(existing.bio || '');

    setLocation(existing.location || '');
    setLink(existing.link || '');

    const jd = existing.joinedDate;
    if (jd) {
      const d = new Date(jd);
      setJoinedDate(Number.isNaN(d.getTime()) ? null : d);
    } else {
      setJoinedDate(null);
    }

    setFollowing(
      typeof existing.followingCount === 'number'
        ? String(existing.followingCount)
        : existing.followingCount
          ? String(existing.followingCount)
          : ''
    );
    setFollowers(
      typeof existing.followerCount === 'number'
        ? String(existing.followerCount)
        : existing.followerCount
          ? String(existing.followerCount)
          : ''
    );
  }, [isEdit, profileId, sid, getUserProfilesForScenario, getProfileById]);

  const canSubmit = name.trim().length > 0 && handle.trim().length > 0;

  const pickTempAvatar = () => {
    const rand = Math.floor(Math.random() * 70) + 1;
    setAvatarUrl(`https://i.pravatar.cc/150?img=${rand}`);
  };

  const onSave = async () => {
    const toOptionalInt = (v: string) => {
      const digits = String(v ?? '').replace(/[^0-9]/g, '');
      if (!digits) return undefined;
      const n = Number(digits);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(MAX_COUNT, Math.max(0, Math.floor(n)));
    };

    const normalizeLink = (v: string) => {
      const s = v.trim();
      if (!s) return undefined;
      // allow raw domain by auto-prefixing https://
      if (/^https?:\/\//i.test(s)) return s;
      return `https://${s}`;
    };

    const payload = {
      id: isEdit && profileId ? String(profileId) : undefined,
      scenarioId: sid,
      ownerUserId: String(userId ?? 'u14'),
      displayName: name.trim(),
      handle: handle.trim(),
      avatarUrl,
      bio: bio.trim() || undefined,
      location: location.trim() || undefined,
      link: normalizeLink(link),
      joinedDate: joinedDate
        ? joinedDate.toISOString().slice(0, 10) // YYYY-MM-DD
        : undefined,
      followingCount: toOptionalInt(following),
      followerCount: toOptionalInt(followers),
    };

    if (isEdit) {
      if (!payload.id) return;
      await updateProfile(payload as any);
    } else {
      const { id, ...createPayload } = payload;
      await createProfile(createPayload as any);
    }

    console.log('[CreateProfileModal] saved', { isEdit, payload });
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable
        accessible={false}
        style={{ flex: 1 }}
        onPress={() => {
          Keyboard.dismiss();
          setShowJoinedPicker(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
              {isEdit ? 'Edit profile' : 'Create profile'}
            </ThemedText>

            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.avatarWrap}>
            <Pressable
              onPress={pickTempAvatar}
              hitSlop={12}
              style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.85 }]}
            >
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              <View
                style={[
                  styles.avatarOverlay,
                  { backgroundColor: colors.tint, borderColor: colors.background },
                ]}
              >
                <ThemedText style={styles.avatarPlus}>＋</ThemedText>
              </View>
            </Pressable>

            <ThemedText style={[styles.avatarHint, { color: colors.textSecondary }]}>
              Add profile photo
            </ThemedText>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            <View style={styles.form}>
              <Input
                label="Display name"
                value={name}
                onChangeText={setName}
                colors={colors}
                maxLength={LIMITS.displayName}
              />

              <Input
                label="Handle"
                value={handle}
                onChangeText={setHandle}
                colors={colors}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={LIMITS.handle}
              />

              <Input
                label="Bio (optional)"
                value={bio}
                onChangeText={setBio}
                colors={colors}
                multiline
                maxLength={LIMITS.bio}
              />

              <Input
                label="Location (optional)"
                value={location}
                onChangeText={setLocation}
                colors={colors}
                maxLength={LIMITS.location}
              />

              <Input
                label="Link (optional)"
                value={link}
                onChangeText={setLink}
                colors={colors}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={LIMITS.link}
              />

              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowJoinedPicker(true);
                }}
                style={({ pressed }) => [
                  styles.inputWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.pressed : 'transparent',
                  },
                ]}
              >
                <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>
                  Joined date
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 16,
                    color: joinedDate ? colors.text : colors.textSecondary,
                    paddingVertical: 2,
                    opacity: joinedDate ? 1 : 0.85,
                  }}
                >
                  {(joinedDate ?? new Date()).toLocaleDateString()}
                </ThemedText>
              </Pressable>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Following (optional)"
                    value={following}
                    onChangeText={setFollowing}
                    colors={colors}
                    keyboardType="number-pad"
                    maxLength={11}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Followers (optional)"
                    value={followers}
                    onChangeText={setFollowers}
                    colors={colors}
                    keyboardType="number-pad"
                    maxLength={11}
                  />
                </View>
              </View>

              <Pressable
                disabled={!canSubmit}
                onPress={onSave}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.text,
                    opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <ThemedText style={{ color: colors.background, fontWeight: '700' }}>
                  {isEdit ? 'Save' : 'Create'}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>

          <Modal
            visible={showJoinedPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowJoinedPicker(false)}
          >
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => {
                Keyboard.dismiss();
                setShowJoinedPicker(false);
              }}
            >
              <Pressable
                style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {}}
              >
                <ThemedText style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                  Joined date
                </ThemedText>

                <DateTimePicker
                  value={joinedDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    // Android emits a "dismissed" event; don't change state in that case.
                    if (Platform.OS !== 'ios') {
                      const type = (event as any)?.type;
                      if (type === 'dismissed') {
                        setShowJoinedPicker(false);
                        return;
                      }
                      setShowJoinedPicker(false);
                    }
                    if (date) setJoinedDate(date);
                  }}
                />

                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={() => setShowJoinedPicker(false)}
                    style={({ pressed }) => [styles.pickerDone, { opacity: pressed ? 0.75 : 1 }]}
                    hitSlop={10}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: '800' }}>Done</ThemedText>
                  </Pressable>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

function Input({
  label,
  value,
  onChangeText,
  colors,
  multiline,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  maxLength,
}: any) {
  return (
    <View style={[styles.inputWrap, { borderColor: colors.border }]}>
      <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>
        {label}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={[styles.input, { color: colors.text }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  form: {
    padding: 16,
    gap: 14,
  },

  row2: {
    flexDirection: 'row',
    gap: 12,
  },

  inputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  input: {
    fontSize: 16,
    flex: 1,
    paddingVertical: 2,
  },

  pickerWrap: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },

  pickerBackdrop: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  pickerModalCard: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
  },

  pickerDone: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-end',
  },

  primaryBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    alignItems: 'center',
  },

  avatarBtn: {
    position: 'relative',
  },

  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 999,
  },

  avatarOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  avatarPlus: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '800',
  },

  avatarHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.9,
  },
});