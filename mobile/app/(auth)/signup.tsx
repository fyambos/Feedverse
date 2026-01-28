import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Alert } from '@/context/dialog';
import {
  getPasswordValidationError,
  getUsernameValidationError,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
  normalizeUsernameInput,
} from '@/lib/validation/auth';

const MAX_IDENTIFIER_LEN = 128;
const MAX_CODE_LEN = 6;

type Step = 'details' | 'verify';

export default function SignupScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { checkUsernameAvailable, requestSignupCode, confirmSignup } = useAuth();

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('details');
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameAvailability, setUsernameAvailability] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'available' }
    | { state: 'taken'; reason?: string }
    | { state: 'error'; reason: string }
  >({ state: 'idle' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const normalizedUsername = useMemo(() => normalizeUsernameInput(username), [username]);

  const usernameError = useMemo(() => {
    if (!username) return null;
    return getUsernameValidationError(username);
  }, [username]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    return getPasswordValidationError(password);
  }, [password]);

  const canRequest =
    !loading &&
    isValidUsername(normalizedUsername) &&
    isValidEmail(normalizedEmail) &&
    isValidPassword(password);

  const canConfirm = !loading && code.trim().length === MAX_CODE_LEN;

  useEffect(() => {
    return () => {
      setLoading(false);
      setUsername('');
      setPassword('');
      setShowPw(false);
      setCode('');
      setStep('details');
    };
  }, []);

  const checkUsername = async () => {
    const u = normalizedUsername;
    if (!u) {
      setUsernameAvailability({ state: 'idle' });
      return;
    }
    if (!isValidUsername(u)) {
      setUsernameAvailability({ state: 'error', reason: getUsernameValidationError(u) ?? 'Invalid username.' });
      return;
    }

    setUsernameAvailability({ state: 'checking' });
    const res = await checkUsernameAvailable(u);
    if (!res.ok) {
      setUsernameAvailability({ state: 'error', reason: res.reason });
      return;
    }
    if (!res.available) {
      setUsernameAvailability({ state: 'taken', reason: res.reason });
      return;
    }
    setUsernameAvailability({ state: 'available' });
  };

  const onRequestCode = async () => {
    const u = normalizedUsername;
    const e = normalizedEmail;
    const pw = password;

    if (!isValidUsername(u)) {
      Alert.alert('Invalid username', getUsernameValidationError(u) ?? `Use at least ${USERNAME_MIN_LEN} characters.`);
      return;
    }

    if (!isValidEmail(e)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (!isValidPassword(pw)) {
      Alert.alert('Invalid password', `Use at least ${PASSWORD_MIN_LEN} characters, including one letter and one number.`);
      return;
    }

    setLoading(true);
    try {
      const avail = await checkUsernameAvailable(u);
      if (!avail.ok) {
        Alert.alert('Username check failed', avail.reason);
        setLoading(false);
        return;
      }
      if (!avail.available) {
        Alert.alert('Username taken', avail.reason ?? 'Please choose a different username.');
        setUsernameAvailability({ state: 'taken', reason: avail.reason });
        setLoading(false);
        return;
      }

      const res = await requestSignupCode({ email: e, username: u });
      if (!res.ok) {
        Alert.alert('Could not send code', res.error);
        setLoading(false);
        return;
      }

      setShowPw(false);
      setCode('');
      setStep('verify');
      setTimeout(() => codeRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    const u = normalizedUsername;
    const e = normalizedEmail;
    const c = code.trim();
    const pw = password;

    if (c.length !== MAX_CODE_LEN) {
      Alert.alert('Invalid code', 'Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const res = await confirmSignup({ email: e, username: u, code: c, password: pw });
      if (!res.ok) {
        Alert.alert('Sign up failed', res.error);
        return;
      }

      setPassword('');
      setShowPw(false);
      setCode('');
      router.replace('/' as any);
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    const u = normalizedUsername;
    const e = normalizedEmail;
    setLoading(true);
    try {
      const res = await requestSignupCode({ email: e, username: u });
      if (!res.ok) {
        Alert.alert('Could not resend code', res.error);
        return;
      }
      Alert.alert('Code sent', `We sent a new 6-digit code to ${e}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      title={step === 'details' ? 'Create your account' : 'Verify your email'}
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
        {step === 'details' ? (
          <>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Username</ThemedText>
              <TextInput
                ref={usernameRef}
                value={username}
                onChangeText={(t) => {
                  setUsernameAvailability({ state: 'idle' });
                  setUsername(normalizeUsernameInput(t).slice(0, USERNAME_MAX_LEN));
                }}
                onBlur={checkUsername}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
              />

              <ThemedText
                style={[
                  styles.hint,
                  {
                    color:
                      usernameAvailability.state === 'available'
                        ? (scheme === 'dark' ? '#6EE7B7' : '#0F7A4B')
                        : usernameAvailability.state === 'taken' || usernameAvailability.state === 'error' || usernameError
                          ? (scheme === 'dark' ? '#FF6B6B' : '#B00020')
                          : colors.textSecondary,
                  },
                ]}
              >
                {usernameError
                  ? usernameError
                  : usernameAvailability.state === 'checking'
                    ? 'Checking availability…'
                    : usernameAvailability.state === 'available'
                      ? 'Username is available.'
                      : usernameAvailability.state === 'taken'
                        ? (usernameAvailability.reason ?? 'Username is taken.')
                        : usernameAvailability.state === 'error'
                          ? usernameAvailability.reason
                          : `Use ${USERNAME_MIN_LEN}-${USERNAME_MAX_LEN} characters (letters, numbers, underscores).`}
              </ThemedText>
            </View>

            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Email</ThemedText>
              <TextInput
                ref={emailRef}
                value={email}
                onChangeText={(t) => setEmail(t.slice(0, MAX_IDENTIFIER_LEN))}
                editable={!loading}
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
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Password</ThemedText>

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
                editable={!loading}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                returnKeyType="done"
                onSubmitEditing={onRequestCode}
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
              onPress={onRequestCode}
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
                {loading ? 'Sending…' : 'Send verification code'}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>
              We sent a 6-digit code to {normalizedEmail}.
            </ThemedText>

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
                onChangeText={(t) => setCode(t.replace(/\D+/g, '').slice(0, MAX_CODE_LEN))}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={onConfirm}
                placeholder=" "
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, letterSpacing: 6 }]}
              />
            </View>

            <Pressable
              onPress={onConfirm}
              disabled={!canConfirm}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.text,
                  opacity: !canConfirm ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.primaryBtnText, { color: colors.background }]}>
                {loading ? 'Creating…' : 'Create account'}
              </ThemedText>
            </Pressable>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Pressable onPress={onResend} disabled={loading} hitSlop={10}>
                <ThemedText style={[styles.link, { color: colors.tint, opacity: loading ? 0.6 : 1 }]}>Resend code</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowPw(false);
                  setCode('');
                  setStep('details');
                  setTimeout(() => usernameRef.current?.focus(), 50);
                }}
                disabled={loading}
                hitSlop={10}
              >
                <ThemedText style={[styles.link, { color: colors.tint, opacity: loading ? 0.6 : 1 }]}>Edit details</ThemedText>
              </Pressable>
            </View>
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