import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

const INVITE_LIMITS = {
  MAX_CODE: 9,
};

function normalizeInviteCode(input: string) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, INVITE_LIMITS.MAX_CODE);
}

export default function JoinScenarioModal() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const { isReady, joinScenarioByInviteCode } = useAppData() as any;

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const canSubmit = useMemo(() => normalizeInviteCode(code).length > 0, [code]);

  const onJoin = useCallback(async () => {
    if (submitting) return;
    if (!isReady) return;

    const uid = String(userId ?? "").trim();
    if (!uid) {
      Alert.alert("Not signed in", "You need to be signed in to join a scenario.");
      return;
    }

    const normalized = normalizeInviteCode(code);
    if (!normalized) return;

    setSubmitting(true);
    try {
      const scenario = await joinScenarioByInviteCode(normalized, uid);

      if (!scenario) {
        Alert.alert("Not found", "This scenario doesn’t exist.");
        return;
      }
      if (scenario.alreadyIn) {
        Alert.alert("Already joined", "You’re already in this scenario.");
        return;
      }
      router.back();

    } catch (e: any) {
      Alert.alert("Join failed", e?.message ?? "Could not join scenario.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, isReady, userId, code, joinScenarioByInviteCode]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>

            <ThemedText type="defaultSemiBold">Join scenario</ThemedText>

            <Pressable
              onPress={onJoin}
              disabled={!canSubmit || submitting}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: !canSubmit || submitting ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>
                Join
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
          >
            <ThemedText style={{ color: colors.textSecondary }}>
              Enter an invite code to join an existing scenario.
            </ThemedText>

            <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="key-outline" size={18} color={colors.textSecondary} />
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={(v) => setCode(normalizeInviteCode(v))}
                placeholder="INVITE CODE"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="ascii-capable"
                returnKeyType="go"
                onSubmitEditing={onJoin}
                editable={!submitting}
                style={[styles.input, { color: colors.text }]}
              />
              <ThemedText style={{ color: colors.textMuted, fontSize: 12 }}>
                {normalizeInviteCode(code).length}/{INVITE_LIMITS.MAX_CODE}
              </ThemedText>
            </View>

            <ThemedText style={{ color: colors.textMuted, fontSize: 12 }}>
              Codes use letters and numbers only.
            </ThemedText>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  codeBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
});