import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RowCard } from "@/components/ui/RowCard";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/context/auth";
import { Alert } from "@/context/dialog";
import { formatErrorMessage } from "@/lib/utils/format";

const MAX_PASSWORD_LEN = 128;

type Step = "request" | "confirm";

function extractError(res: { status: number; json: any; text: string }) {
  const j: any = res?.json;
  if (typeof j?.error === "string" && j.error.trim()) return j.error;
  if (typeof j?.message === "string" && j.message.trim()) return j.message;
  if (typeof res?.text === "string" && res.text.trim()) return res.text;
  return `Request failed (HTTP ${res?.status ?? 0})`;
}

export default function ChangePasswordScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { token, fetchWithAuth, signOut } = useAuth();

  const codeRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>("request");
  const [loading, setLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const hasToken = useMemo(() => Boolean(String(token ?? "").trim()), [token]);

  const canRequest =
    hasToken &&
    currentPassword.length >= 1 &&
    currentPassword.length <= MAX_PASSWORD_LEN &&
    !loading;

  const canConfirm =
    hasToken &&
    currentPassword.length >= 1 &&
    code.trim().length >= 4 &&
    newPassword.length >= 8 &&
    newPassword.length <= MAX_PASSWORD_LEN &&
    confirmPassword === newPassword &&
    !loading;

  const requestCode = useCallback(async () => {
    if (!canRequest) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/change-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });

      if (!res.ok) {
        Alert.alert("Change password", extractError(res));
        setLoading(false);
        return;
      }

      setStep("confirm");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPw(false);
      setTimeout(() => codeRef.current?.focus(), 50);

      Alert.alert("Check your email", "We sent a 6-digit code to confirm your password change.");
    } catch (e: unknown) {
      Alert.alert("Change password", formatErrorMessage(e, "Request failed"));
    }
    setLoading(false);
  }, [canRequest, currentPassword, fetchWithAuth]);

  const confirmChange = useCallback(async () => {
    if (!canConfirm) return;

    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords do not match", "Please re-enter your new password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/change-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          code: code.trim(),
        }),
      });

      if (!res.ok) {
        Alert.alert("Change password", extractError(res));
        setLoading(false);
        return;
      }

      Alert.alert("Password updated", "Please sign in again.");

      // Server revokes sessions; locally sign out for safety.
      await signOut();
      router.replace("/(auth)/login" as any);
    } catch (e: unknown) {
      Alert.alert("Change password", formatErrorMessage(e, "Request failed"));
    }
    setLoading(false);
  }, [canConfirm, code, confirmPassword, currentPassword, fetchWithAuth, newPassword, signOut]);

  if (!hasToken) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.icon} />
            </Pressable>

            <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
              Change password
            </ThemedText>

            <View style={{ width: 22 }} />
          </View>

          <View style={{ flex: 1, padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              You must be signed in to change your password.
            </ThemedText>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.icon} />
            </Pressable>

            <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
              Change password
            </ThemedText>

            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            <ThemedText style={{ color: colors.textSecondary, marginBottom: 14 }}>
              {step === "request"
                ? "Enter your current password to request a code."
                : "Enter the code from your email, then choose a new password."}
            </ThemedText>

            <ThemedView style={{ gap: 12 }}>
              <RowCard
                label="Current password"
                colors={colors}
                right={
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPw ? "Hide password" : "Show password"}
                  >
                    <ThemedText type="defaultSemiBold" style={{ color: colors.tint, fontSize: 13 }}>
                      {showPw ? "Hide" : "Show"}
                    </ThemedText>
                  </Pressable>
                }
              >
                <TextInput
                  value={currentPassword}
                  onChangeText={(t) => setCurrentPassword(t.slice(0, MAX_PASSWORD_LEN))}
                  editable={!loading}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Current password"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType={step === "request" ? "send" : "next"}
                  onSubmitEditing={step === "request" ? requestCode : () => codeRef.current?.focus()}
                  style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                />
              </RowCard>

              {step === "confirm" ? (
                <>
                  <RowCard label="Code" colors={colors}>
                    <TextInput
                      ref={codeRef}
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/\s+/g, "").slice(0, 12))}
                      editable={!loading}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="number-pad"
                      placeholder="6-digit code"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="next"
                      onSubmitEditing={() => newPasswordRef.current?.focus()}
                      style={[styles.input, { color: colors.text, borderBottomColor: colors.border, letterSpacing: 2 }]}
                    />
                  </RowCard>

                  <RowCard
                    label="New password"
                    colors={colors}
                    right={
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={showPw ? "Hide password" : "Show password"}
                      >
                        <ThemedText type="defaultSemiBold" style={{ color: colors.tint, fontSize: 13 }}>
                          {showPw ? "Hide" : "Show"}
                        </ThemedText>
                      </Pressable>
                    }
                  >
                    <TextInput
                      ref={newPasswordRef}
                      value={newPassword}
                      onChangeText={(t) => setNewPassword(t.slice(0, MAX_PASSWORD_LEN))}
                      editable={!loading}
                      secureTextEntry={!showPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="New password (min 8 chars)"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="next"
                      onSubmitEditing={() => {}}
                      style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                    />
                  </RowCard>

                  <RowCard
                    label="Confirm"
                    colors={colors}
                    right={
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={showPw ? "Hide password" : "Show password"}
                      >
                        <ThemedText type="defaultSemiBold" style={{ color: colors.tint, fontSize: 13 }}>
                          {showPw ? "Hide" : "Show"}
                        </ThemedText>
                      </Pressable>
                    }
                  >
                    <TextInput
                      value={confirmPassword}
                      onChangeText={(t) => setConfirmPassword(t.slice(0, MAX_PASSWORD_LEN))}
                      editable={!loading}
                      secureTextEntry={!showPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={confirmChange}
                      style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                    />
                  </RowCard>
                </>
              ) : null}

              {step === "request" ? (
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
                    {loading ? "Sending…" : "Send code"}
                  </ThemedText>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={confirmChange}
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
                      {loading ? "Updating…" : "Update password"}
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
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },

  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  input: {
    flex: 1,
    fontSize: 16,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },

  primaryBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700" },

  linkBtn: { alignSelf: "flex-start", marginTop: 6 },
  link: { fontSize: 15, fontWeight: "600" },
});
