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

type Step = "request" | "confirm";

function extractError(res: { status: number; json: any; text: string }) {
  const j: any = res?.json;
  if (typeof j?.error === "string" && j.error.trim()) return j.error;
  if (typeof j?.message === "string" && j.message.trim()) return j.message;
  if (typeof res?.text === "string" && res.text.trim()) return res.text;
  return `Request failed (HTTP ${res?.status ?? 0})`;
}

export default function ChangeEmailScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { token, currentUser, fetchWithAuth, refreshCurrentUser } = useAuth();

  const codeRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>("request");
  const [loading, setLoading] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");

  const hasToken = useMemo(() => Boolean(String(token ?? "").trim()), [token]);
  const currentEmail = String(currentUser?.email ?? "").trim();

  const canRequest = hasToken && newEmail.trim().length >= 3 && !loading;
  const canConfirm = hasToken && newEmail.trim().length >= 3 && code.trim().length >= 4 && !loading;

  const requestCode = useCallback(async () => {
    if (!canRequest) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/email/change/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });

      if (!res.ok) {
        Alert.alert("Change email", extractError(res));
        setLoading(false);
        return;
      }

      setStep("confirm");
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 50);

      Alert.alert("Check your email", `We sent a 6-digit code to ${newEmail.trim()}.`);
    } catch (e: unknown) {
      Alert.alert("Change email", formatErrorMessage(e, "Request failed"));
    }
    setLoading(false);
  }, [canRequest, fetchWithAuth, newEmail]);

  const confirm = useCallback(async () => {
    if (!canConfirm) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/email/change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim(), code: code.trim() }),
      });

      if (!res.ok) {
        Alert.alert("Change email", extractError(res));
        setLoading(false);
        return;
      }

      await refreshCurrentUser();
      Alert.alert("Email updated", "Your email was updated and verified.");
      router.back();
    } catch (e: unknown) {
      Alert.alert("Change email", formatErrorMessage(e, "Request failed"));
    }
    setLoading(false);
  }, [canConfirm, code, fetchWithAuth, newEmail, refreshCurrentUser]);

  const editEmail = useCallback(() => {
    setStep("request");
    setCode("");
    setTimeout(() => emailRef.current?.focus(), 50);
  }, []);

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
              Change email
            </ThemedText>

            <View style={{ width: 22 }} />
          </View>

          <View style={{ flex: 1, padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              You must be signed in to change your email.
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
              Change email
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
                ? currentEmail
                  ? `Current email: ${currentEmail}`
                  : "Add an email to your account."
                : "Enter the code from your new email to confirm the change."}
            </ThemedText>

            <ThemedView style={{ gap: 12 }}>
              <RowCard label={step === "request" ? "New email" : "New email"} colors={colors}>
                <TextInput
                  ref={emailRef}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  editable={!loading && step === "request"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType={step === "request" ? "send" : "next"}
                  onSubmitEditing={step === "request" ? requestCode : () => codeRef.current?.focus()}
                  style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                />
              </RowCard>

              {step === "confirm" ? (
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
                    returnKeyType="done"
                    onSubmitEditing={confirm}
                    style={[styles.input, { color: colors.text, borderBottomColor: colors.border, letterSpacing: 2 }]}
                  />
                </RowCard>
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
                    onPress={confirm}
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
                      {loading ? "Updating…" : "Update email"}
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

                  <Pressable
                    onPress={editEmail}
                    disabled={loading}
                    style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
                    hitSlop={10}
                  >
                    <ThemedText style={[styles.link, { color: colors.tint }]}>Edit email</ThemedText>
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
