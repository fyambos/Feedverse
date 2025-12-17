import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { AuthScreen } from '@/components/auth/AuthScreen';

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
    <AuthScreen
      title="Sign in to Feedverse"
      bottom={
        <>
          <ThemedText style={{ color: colors.textSecondary }}>
            Don&apos;t have an account?{' '}
          </ThemedText>
          <Pressable onPress={() => router.push('/(auth)/signup' as any)} hitSlop={10}>
            <ThemedText style={[styles.link, { color: colors.tint }]}>Sign up</ThemedText>
          </Pressable>
        </>
      }
    >
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
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },

  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: { fontSize: 12, marginBottom: 4 },
  input: {
    fontSize: 16,
    paddingVertical: 0,
    minHeight: 22,
  },

  primaryBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },

  linkBtn: { alignSelf: 'flex-start', marginTop: 6 },
  link: { fontSize: 15, fontWeight: '600' },
});