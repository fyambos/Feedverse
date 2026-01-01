import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { AuthScreen } from '@/components/auth/AuthScreen';

const MAX_IDENTIFIER_LEN = 128;
const MAX_PASSWORD_LEN = 128;

export default function LoginScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { signInMock } = useAuth();

  const passwordRef = useRef<TextInput>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const normalizedIdentifier = useMemo(() => identifier.trim(), [identifier]);

  const canSubmit =
    normalizedIdentifier.length > 0 &&
    password.length >= 1 &&
    password.length <= MAX_PASSWORD_LEN;

  // Clear sensitive fields when leaving this screen (unmount)
  useEffect(() => {
    return () => {
      setPassword('');
      setShowPw(false);
    };
  }, []);

  const onLogin = async () => {
    if (!canSubmit) return;

    const ident = normalizedIdentifier;
    const pw = password;

    await signInMock();

    // Clear sensitive state ASAP
    setPassword('');
    setShowPw(false);

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
            onChangeText={(t) => setIdentifier(t.slice(0, MAX_IDENTIFIER_LEN))}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="username"
            textContentType="username"
            importantForAutofill="yes"
            keyboardType="email-address"
            inputMode="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
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
          <View style={styles.passwordRow}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
              Password
            </ThemedText>

            <Pressable
              onPress={() => setShowPw((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
            >
              <ThemedText style={[styles.pwToggle, { color: colors.tint }]}>
                {showPw ? 'Hide' : 'Show'}
              </ThemedText>
            </Pressable>
          </View>

          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={(t) => setPassword(t.slice(0, MAX_PASSWORD_LEN))}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="password"
            textContentType="password"
            importantForAutofill="yes"
            returnKeyType="done"
            onSubmitEditing={onLogin}
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

  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pwToggle: { fontSize: 13, fontWeight: '700' },

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