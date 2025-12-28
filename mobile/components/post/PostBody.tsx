// mobile/components/post/PostBody.tsx
import React from "react";
import { StyleSheet, View, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Lightbox } from "@/components/media/LightBox";
import { PostQuoted } from "@/components/post/PostQuoted";

import type { Post as DbPost } from "@/data/db/schema";

type ColorsLike = {
  border: string;
  text: string;
  textSecondary: string;
  background: string;
  pressed: string;
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

export function PostBody({ sid, variant, colors, item, isReply, textStyle, addVideoIcon }: Props) {
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

  return (
    <View>
      <ThemedText style={[styles.text, isDetail && styles.textDetail, isReply && styles.textReply, textStyle]}>
        {item.text}
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

      <PostQuoted sid={sid} isDetail={isDetail} quotedPostId={item.quotedPostId} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  textReply: { marginTop: 0 },
  textDetail: { fontSize: 18, lineHeight: 20, marginTop: 10 },

  // single media (matches your CreatePost preview vibe)
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