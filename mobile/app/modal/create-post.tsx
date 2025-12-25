import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import { pickAndPersistManyImages } from "@/components/ui/ImagePicker";

const MAX_IMAGES = 4;

export default function CreatePostModal() {
  const { scenarioId, mode, postId } = useLocalSearchParams<{
    scenarioId: string;
    mode?: "edit";
    postId?: string;
  }>();

  const sid = String(scenarioId ?? "");
  const isEdit = mode === "edit" && !!postId;

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { userId } = useAuth();
  const {
    getPostById,
    getSelectedProfileId,
    upsertPost,
  } = useAppData();

  /* -------------------------------------------------------------------------- */
  /* State                                                                      */
  /* -------------------------------------------------------------------------- */

  const existingPost = useMemo(
    () => (isEdit && postId ? getPostById(String(postId)) : null),
    [isEdit, postId, getPostById]
  );

  const [text, setText] = useState(existingPost?.text ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(
    existingPost?.imageUrls ?? []
  );
  const [submitting, setSubmitting] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* Actions                                                                    */
  /* -------------------------------------------------------------------------- */

  const pickImages = async () => {
    const remaining = Math.max(0, MAX_IMAGES - imageUrls.length);
    if (remaining <= 0) {
      Alert.alert("Limit reached", "You can add up to 4 images.");
      return;
    }

    const picked = await pickAndPersistManyImages({
      remaining,
      persistAs: "img",
      quality: 0.9,
    });

    if (!picked.length) return;

    setImageUrls((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  };

  const removeImage = (uri: string) => {
    setImageUrls((prev) => prev.filter((u) => u !== uri));
  };

  const submit = async () => {
    if (submitting) return;

    const profileId = getSelectedProfileId(sid);
    if (!profileId) {
      Alert.alert("No profile selected", "Please choose a profile first.");
      return;
    }

    if (!text.trim() && imageUrls.length === 0) {
      Alert.alert("Empty post", "Write something or add an image.");
      return;
    }

    setSubmitting(true);

    try {
      const now = new Date().toISOString();

      await upsertPost({
        id: existingPost?.id ?? `post_${Date.now()}`,
        scenarioId: sid,
        authorProfileId: profileId,
        text: text.trim(),
        imageUrls,
        parentPostId: existingPost?.parentPostId ?? null,
        createdAt: existingPost?.createdAt ?? now,
        updatedAt: now,
      } as any);

      router.back();
    } catch {
      Alert.alert("Error", "Could not save post.");
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>

        <ThemedText type="defaultSemiBold">
          {isEdit ? "Edit post" : "New post"}
        </ThemedText>

        <Pressable
          onPress={submit}
          disabled={submitting}
          hitSlop={12}
          style={{ opacity: submitting ? 0.5 : 1 }}
        >
          <ThemedText style={{ color: colors.tint, fontWeight: "800" }}>
            {isEdit ? "Save" : "Post"}
          </ThemedText>
        </Pressable>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What’s happening?"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[
            styles.input,
            { color: colors.text },
          ]}
        />

        {/* Images */}
        {imageUrls.length > 0 && (
          <FlatList
            data={imageUrls}
            horizontal
            keyExtractor={(u) => u}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
            renderItem={({ item }) => (
              <View style={styles.imageWrap}>
                <Image source={{ uri: item }} style={styles.image} />

                <Pressable
                  onPress={() => removeImage(item)}
                  style={styles.removeBtn}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom bar */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable onPress={pickImages} hitSlop={12}>
          <Ionicons name="image-outline" size={22} color={colors.text} />
        </Pressable>

        <ThemedText style={{ color: colors.textSecondary }}>
          {imageUrls.length}/{MAX_IMAGES}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */

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

  content: {
    flex: 1,
    padding: 16,
    gap: 16,
  },

  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: "top",
  },

  imageWrap: {
    width: 160,
    height: 160,
    borderRadius: 14,
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
  },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
