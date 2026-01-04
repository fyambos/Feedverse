// mobile/components/post/PostBody.tsx
import React from "react";
import { StyleSheet, View, Pressable, Image, Text, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Lightbox } from "@/components/media/LightBox";

import type { Post as DbPost } from "@/data/db/schema";

type ColorsLike = {
  border: string;
  text: string;
  textSecondary: string;
  background: string;
  pressed: string;
  // optional (your theme likely has it)
  tint?: string;
};

type Props = {
  sid: string;
  variant: "feed" | "detail" | "reply";
  colors: ColorsLike;

  item: DbPost;

  isReply?: boolean;
  textStyle?: any;

  addVideoIcon?: boolean;
};

type TextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "mention"; value: string }
  | { type: "hashtag"; value: string };

function parseText(text: string): TextPart[] {
  // order matters: mention/hashtag/link
  const regex = /(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s]+)/g;
  const parts: TextPart[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) parts.push({ type: "mention", value: match[1] });
    else if (match[2]) parts.push({ type: "hashtag", value: match[2] });
    else if (match[3]) parts.push({ type: "link", value: match[3] });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

export function PostBody({
  sid,
  variant,
  colors,
  item,
  isReply,
  textStyle,
  addVideoIcon,
}: Props) {
  const isDetail = variant === "detail";

  const mediaUrls = (item.imageUrls ?? [])
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, 4);

  const showVideoOverlay = Boolean(addVideoIcon) && mediaUrls.length === 1;

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);

  const openLightbox = (idx: number) => {
    const safe = Math.max(0, Math.min(idx, Math.max(0, mediaUrls.length - 1)));
    setLightboxIndex(safe);
    setLightboxOpen(true);
  };

  const singleUri = mediaUrls[0];

  const linkColor = colors.tint ?? "#1d9bf0";

  const onPressMention = (raw: string) => {
    const handle = raw.slice(1);
    router.push({
      pathname: `/(scenario)/${encodeURIComponent(sid)}/(tabs)/search`,
      params: { q: handle },
    } as any);
  };

  const onPressHashtag = (raw: string) => {
    const tag = raw.slice(1);
    router.push({
      pathname: `/(scenario)/${encodeURIComponent(sid)}/(tabs)/search`,
      params: { q: `#${tag}` },
    } as any);
  };

  const onPressLink = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {
      // no-op
    }
  };

  return (
    <View>
      <ThemedText style={[styles.text, isDetail && styles.textDetail, isReply && styles.textReply, textStyle]}>
        {parseText(item.text ?? "").map((part, i) => {
          if (part.type === "link") {
            return (
              <Text
                key={`l-${i}`}
                style={[styles.inlineTap, { color: linkColor }]}
                onPress={() => onPressLink(part.value)}
              >
                {part.value}
              </Text>
            );
          }

          if (part.type === "mention") {
            return (
              <Text
                key={`m-${i}`}
                style={[styles.inlineTap, { color: linkColor }]}
                onPress={() => onPressMention(part.value)}
              >
                {part.value}
              </Text>
            );
          }

          if (part.type === "hashtag") {
            return (
              <Text
                key={`h-${i}`}
                style={[styles.inlineTap, { color: linkColor }]}
                onPress={() => onPressHashtag(part.value)}
              >
                {part.value}
              </Text>
            );
          }

          return (
            <Text key={`t-${i}`} style={{ color: colors.text }}>
              {part.value}
            </Text>
          );
        })}
      </ThemedText>

      {mediaUrls.length === 1 ? (
        <>
          <Pressable
            onPress={() => openLightbox(0)}
            style={[styles.singleWrap, { backgroundColor: colors.border }]}
          >
            <Image source={{ uri: singleUri }} style={styles.singleImage} />

            {showVideoOverlay ? (
              <View pointerEvents="none" style={styles.playOverlay}>
                <Ionicons name="play-circle" size={56} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          <Lightbox
            urls={mediaUrls}
            initialIndex={lightboxIndex}
            visible={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            allowSave
          />
        </>
      ) : mediaUrls.length > 1 ? (
        <>
          <MediaGrid
            urls={mediaUrls}
            variant={variant}
            onOpen={openLightbox}
            backgroundColor={colors.border}
          />
          <Lightbox
            urls={mediaUrls}
            initialIndex={lightboxIndex}
            visible={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            allowSave
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  textReply: { marginTop: 0 },
  textDetail: { fontSize: 18, lineHeight: 20, marginTop: 10 },

  // small touch comfort, and ensures underline isn't forced
  inlineTap: {
    textDecorationLine: "none",
  },

  singleWrap: {
    marginTop: 10,
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  singleImage: {
    width: "100%",
    height: "100%",
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
});