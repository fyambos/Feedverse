import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Image,
} from 'react-native';
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

  const { createProfile, updateProfile, getUserProfilesForScenario } = useProfile();
  const { userId } = useAuth();

  const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=14';
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');

  const sid = String(scenarioId ?? '');
  const isEdit = !!profileId;

  useEffect(() => {
    if (!isEdit) return;
    const list = getUserProfilesForScenario(sid);
    const existing = list.find((p: any) => p.id === profileId);
    if (!existing) return;

    setAvatarUrl(existing.avatarUrl || DEFAULT_AVATAR);
    setName(existing.displayName || '');
    setHandle(existing.handle || '');
    setBio(existing.bio || '');
  }, [isEdit, profileId, sid, getUserProfilesForScenario]);

  const canSubmit = name.trim().length > 0 && handle.trim().length > 0;

  const pickTempAvatar = () => {
    const rand = Math.floor(Math.random() * 70) + 1;
    setAvatarUrl(`https://i.pravatar.cc/150?img=${rand}`);
  };

  const onSave = async () => {
    const payload = {
      id: isEdit && profileId ? String(profileId) : undefined,
      scenarioId: sid,
      ownerUserId: String(userId ?? 'u14'),
      displayName: name.trim(),
      handle: handle.trim(),
      avatarUrl,
      bio: bio.trim() || undefined,
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

        <View style={styles.form}>
          <Input
            label="Display name"
            value={name}
            onChangeText={setName}
            colors={colors}
          />

          <Input
            label="Handle"
            value={handle}
            onChangeText={setHandle}
            colors={colors}
          />

          <Input
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            colors={colors}
            multiline
          />

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Input({
  label,
  value,
  onChangeText,
  colors,
  multiline,
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