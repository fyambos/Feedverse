import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { apiFetch } from '@/lib/api/apiClient';
import { Alert } from '@/context/dialog';

const MAX_IDENTIFIER_LEN = 128;
const MAX_PASSWORD_LEN = 128;

type Step = 'request' | 'reset';

function errorMessageFrom(res: { status: number; json: any; text: string }) {
  const j = res?.json as any;
  if (typeof j?.error === 'string' && j.error.trim()) return j.error;
  if (typeof j?.message === 'string' && j.message.trim()) return j.message;
  if (typeof res?.text === 'string' && res.text.trim()) return res.text;
  return `Request failed (HTTP ${res?.status ?? 0})`;
}

export default function ForgotPasswordScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const codeRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('request');
  const [loading, setLoading] = useState(false);

  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const normalizedIdentifier = useMemo(() => identifier.trim(), [identifier]);

  const canRequest = normalizedIdentifier.length > 0 && !loading;
  const canReset =
    normalizedIdentifier.length > 0 &&
    code.trim().length >= 4 &&
    newPassword.length >= 8 &&
    newPassword.length <= MAX_PASSWORD_LEN &&
    confirmPassword.length >= 8 &&
    confirmPassword === newPassword &&
    !loading;

  useEffect(() => {
    return () => {
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPw(false);
    };
  }, []);

  const requestCode = async () => {
    if (!canRequest) return;

    setLoading(true);
    try {
      const res = await apiFetch({
        path: '/auth/forgot-password',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: normalizedIdentifier }),
        },
      });

      // Always show generic success to avoid user enumeration.
      if (!res.ok) {
        // Still show an error if the backend is unreachable or misconfigured.
        Alert.alert('Forgot password', errorMessageFrom(res));
        setLoading(false);
        return;
      }

      setStep('reset');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPw(false);

      // Focus next field.
      setTimeout(() => codeRef.current?.focus(), 50);

      Alert.alert(
        'Check your email',
        'If an account exists for that identifier, we sent a 6-digit code.',
      );
    } catch (e: any) {
      Alert.alert('Forgot password', String(e?.message ?? 'Request failed'));
    }

    setLoading(false);
  };

  const resetPassword = async () => {
    if (!canReset) return;

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please re-enter your new password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch({
        path: '/auth/reset-password',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: normalizedIdentifier,
            code: code.trim(),
            newPassword,
          }),
        },
      });

      if (!res.ok) {
        Alert.alert('Reset failed', errorMessageFrom(res));
        setLoading(false);
        return;
      }

      Alert.alert('Password updated', 'You can now sign in with your new password.');
      router.replace('/(auth)/login' as any);
    } catch (e: any) {
      Alert.alert('Reset failed', String(e?.message ?? 'Request failed'));
    }

    setLoading(false);
  };

  return (
    <AuthScreen
      title={step === 'request' ? 'Reset your password' : 'Enter your code'}
      bottom={
        <Pressable onPress={() => router.replace('/(auth)/login' as any)} hitSlop={10}>
          <ThemedText style={[styles.link, { color: colors.tint }]}>Back to sign in</ThemedText>
        </Pressable>
      }
    >
      <View style={styles.form}>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Email or username</ThemedText>
          <TextInput
            value={identifier}
            onChangeText={(t) => setIdentifier(t.slice(0, MAX_IDENTIFIER_LEN))}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            inputMode="email"
            returnKeyType={step === 'request' ? 'send' : 'next'}
            onSubmitEditing={step === 'request' ? requestCode : () => codeRef.current?.focus()}
            placeholder=" "
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
          />
        </View>

        {step === 'request' ? (
          <>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>
              We’ll email you a 6-digit code if your account exists.
            </ThemedText>

            <Pressable
              onPress={requestCode}
              disabled={!canRequest}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.text,
                  opacity: !canRequest ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.primaryBtnText, { color: colors.background }]}>
                {loading ? 'Sending…' : 'Send code'}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>6-digit code</ThemedText>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\s+/g, '').slice(0, 12))}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => newPasswordRef.current?.focus()}
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, letterSpacing: 2 }]}
              />
            </View>

            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.passwordRow}>
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>New password</ThemedText>

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
                ref={newPasswordRef}
                value={newPassword}
                onChangeText={(t) => setNewPassword(t.slice(0, MAX_PASSWORD_LEN))}
                editable={!loading}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => {}}
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
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Confirm new password</ThemedText>

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
                value={confirmPassword}
                onChangeText={(t) => setConfirmPassword(t.slice(0, MAX_PASSWORD_LEN))}
                editable={!loading}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={resetPassword}
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>

            <Pressable
              onPress={resetPassword}
              disabled={!canReset}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.text,
                  opacity: !canReset ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.primaryBtnText, { color: colors.background }]}>
                {loading ? 'Updating…' : 'Update password'}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={requestCode}
              disabled={loading}
              style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
            >
              <ThemedText style={[styles.link, { color: colors.tint }]}>Resend code</ThemedText>
            </Pressable>
          </>
        )}
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
