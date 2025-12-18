import React, { useState } from 'react';
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

export default function CreateProfileModal() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const { createProfile } = useProfile();

  const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=14';
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');

  const canSubmit = name.trim() && handle.trim();

  const pickTempAvatar = () => {
    const rand = Math.floor(Math.random() * 70) + 1;
    setAvatarUrl(`https://i.pravatar.cc/150?img=${rand}`);
  };

  const onCreate = async () => {
    await createProfile({
      scenarioId: String(scenarioId),
      displayName: name.trim(),
      handle: handle.trim(),
      bio: bio.trim() || undefined,
    });
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
            Create profile
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
            label="Username"
            value={handle}
            onChangeText={setHandle}
            colors={colors}
            prefix="@"
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
            onPress={onCreate}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.text,
                opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText style={{ color: colors.background, fontWeight: '700' }}>
              Create
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
  prefix,
}: any) {
  return (
    <View style={[styles.inputWrap, { borderColor: colors.border }]}>
      <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>
        {label}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {prefix && (
          <ThemedText style={{ color: colors.textSecondary }}>{prefix}</ThemedText>
        )}
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