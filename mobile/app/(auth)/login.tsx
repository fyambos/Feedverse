import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';

export default function LoginScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { signInMock } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = identifier.trim().length > 0 && password.length > 0;

  const onLogin = async () => {
    await signInMock();
    router.replace('/' as any);
  };

  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.centerWrap}>
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/FeedverseIcon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <ThemedText style={[styles.title, { color: colors.text }]}>
            Sign in to Feedverse
          </ThemedText>

          <View style={styles.form}>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
                Phone, email, or username
              </ThemedText>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>

            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
                Password
              </ThemedText>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>

            <Pressable
              onPress={onLogin}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.text,
                  opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.primaryBtnText, { color: colors.background }]}>
                Sign in
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {}}
              style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
            >
              <ThemedText style={[styles.link, { color: colors.tint }]}>
                Forgot password?
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <ThemedText style={{ color: colors.textSecondary }}>
            Don&apos;t have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => router.push('/(auth)/signup' as any)}
            hitSlop={10}
          >
            <ThemedText style={[styles.link, { color: colors.tint }]}>Sign up</ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kav: { flex: 1 },
  centerWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    justifyContent: 'flex-start',
  },

  logoWrap: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 14,
  },
  logoImage: {
    width: 56,
    height: 56,
  },

  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 18,
  },

  form: { gap: 12 },

  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  label: {
    fontSize: 12,
    marginBottom: 4,
  },

  input: {
    fontSize: 16,
    paddingVertical: 0,
  },

  primaryBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },

  linkBtn: { alignSelf: 'flex-start', marginTop: 6 },
  link: { fontSize: 15, fontWeight: '600' },

  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});