import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

export function CreatePostHeader({
  colors,
  isEdit,
  canPost,
  showDrafts,
  onPressDrafts,
  onCancel,
  onSubmit,
}: {
  colors: any;
  isEdit: boolean;
  canPost: boolean;
  showDrafts?: boolean;
  onPressDrafts?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={onCancel}
        hitSlop={12}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <ThemedText style={{ color: colors.text, fontSize: 16 }}>
          Cancel
        </ThemedText>
      </Pressable>

      <View style={styles.right}>
        {showDrafts ? (
          <Pressable
            onPress={onPressDrafts}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <ThemedText style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
              Drafts
            </ThemedText>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canPost}
          hitSlop={10}
          style={({ pressed }) => [
            styles.postBtn,
            {
              backgroundColor: colors.tint,
              opacity: !canPost ? 0.45 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <ThemedText style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            {isEdit ? "Save" : "Post"}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 72,
    alignItems: "center",
  },
});