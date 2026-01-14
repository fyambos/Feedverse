import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { AuthScreen } from '@/components/auth/AuthScreen';
import {
  getPasswordValidationError,
  isValidEmail,
  isValidPassword,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from '@/lib/validation/auth';

const MAX_IDENTIFIER_LEN = 128;

export default function SignupScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { signUp } = useAuth();

  const passwordRef = useRef<TextInput>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const normalizedIdentifier = useMemo(() => identifier.trim(), [identifier]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    return getPasswordValidationError(password);
  }, [password]);

  const canSubmit = isValidEmail(normalizedIdentifier) && isValidPassword(password);

  useEffect(() => {
    return () => {
      setPassword('');
      setShowPw(false);
    };
  }, []);

  const onCreate = async () => {
    const email = normalizedIdentifier;

    if (!isValidEmail(email)) {
      alert('Please enter a valid email address.');
      return;
    }

    if (!isValidPassword(password)) {
      alert(`Password must be at least ${PASSWORD_MIN_LEN} characters, including one letter and one number.`);
      return;
    }

    const res = await signUp({ email, password });
    if (!res.ok) {
      alert(res.error);
      return;
    }

    setPassword('');
    setShowPw(false);

    router.replace('/' as any);
  };

  return (
    <AuthScreen
      title="Create your account"
      bottom={
        <>
          <ThemedText style={{ color: colors.textSecondary }}>
            Already have an account?{' '}
          </ThemedText>
          <Pressable onPress={() => router.replace('/(auth)/login' as any)} hitSlop={10}>
            <ThemedText style={[styles.link, { color: colors.tint }]}>Sign in</ThemedText>
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
            Phone or email
          </ThemedText>
          <TextInput
            value={identifier}
            onChangeText={(t) => setIdentifier(t.slice(0, MAX_IDENTIFIER_LEN))}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            inputMode="email"
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
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
            onChangeText={(t) => setPassword(t.slice(0, PASSWORD_MAX_LEN))}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="new-password"
            textContentType="newPassword"
            importantForAutofill="yes"
            returnKeyType="done"
            onSubmitEditing={onCreate}
            placeholder=" "
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
          />

          <ThemedText
            style={[
              styles.hint,
              {
                color: passwordError ? (scheme === 'dark' ? '#FF6B6B' : '#B00020') : colors.textSecondary,
              },
            ]}
          >
            {passwordError
              ? passwordError
              : `Use at least ${PASSWORD_MIN_LEN} characters, including one letter and one number.`}
          </ThemedText>
        </View>

        <Pressable
          onPress={onCreate}
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
            Create account
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
  hint: { marginTop: 6, fontSize: 12 },

  primaryBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },

  link: { fontSize: 15, fontWeight: '600' },
});