// mobile/components/media/Lightbox.tsx
import React from "react";
import {
  Modal,
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { saveImageToDevice } from "@/lib/media/imageSave";

type Props = {
  urls: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  title?: string;
  allowSave?: boolean; // default true
};

const { width: W, height: H } = Dimensions.get("window");
const THUMB = 52;

export function Lightbox({
  urls,
  initialIndex,
  visible,
  onClose,
  title,
  allowSave = true,
}: Props) {
  const insets = useSafeAreaInsets();

  const safeInitial = Math.max(0, Math.min(initialIndex, Math.max(0, urls.length - 1)));
  const [idx, setIdx] = React.useState(safeInitial);

  const listRef = React.useRef<FlatList<string>>(null);
  const thumbsRef = React.useRef<FlatList<string>>(null);

  React.useEffect(() => {
    if (!visible) return;

    const next = Math.max(0, Math.min(initialIndex, Math.max(0, urls.length - 1)));
    setIdx(next);

    // jump to initial image when opened
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: next, animated: false });
      thumbsRef.current?.scrollToIndex({
        index: next,
        animated: false,
        viewPosition: 0.5,
      });
    });
  }, [visible, initialIndex, urls.length]);

  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 12);

  const uri = urls[idx];

  const goTo = React.useCallback(
    (nextIdx: number, animated = true) => {
      const clamped = Math.max(0, Math.min(nextIdx, urls.length - 1));
      setIdx(clamped);
      listRef.current?.scrollToIndex({ index: clamped, animated });
      thumbsRef.current?.scrollToIndex({ index: clamped, animated, viewPosition: 0.5 });
    },
    [urls.length]
  );

  const onViewableItemsChanged = React.useRef(({ viewableItems }: any) => {
    const v = viewableItems?.[0];
    if (!v) return;
    const nextIdx = Number(v.index ?? 0);
    setIdx(nextIdx);
    thumbsRef.current?.scrollToIndex({ index: nextIdx, animated: true, viewPosition: 0.5 });
  }).current;

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 50,
  }).current;

  const renderItem = ({ item }: ListRenderItemInfo<string>) => {
    return (
      <View style={{ width: W, height: "100%", justifyContent: "center", alignItems: "center" }}>
        <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
      </View>
    );
  };

  const renderThumb = ({ item, index }: ListRenderItemInfo<string>) => {
    const active = index === idx;

    return (
      <Pressable
        onPress={() => goTo(index)}
        style={({ pressed }) => [
          styles.thumbWrap,
          pressed && { opacity: 0.8 },
          active && styles.thumbActive,
        ]}
      >
        <Image source={{ uri: item }} style={styles.thumb} resizeMode="cover" />
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: topPad, paddingHorizontal: 14 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.topCenter}>
            {/* optional title */}
            {title ? (
              <View style={styles.titleWrap}>
                {/* keep it simple, avoid themed components */}
              </View>
            ) : null}
          </View>

          {allowSave ? (
            <Pressable
              onPress={() => (uri ? saveImageToDevice(uri) : null)}
              hitSlop={12}
              style={styles.iconBtn}
              disabled={!uri}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Swipe gallery */}
        <FlatList
          ref={listRef}
          data={urls}
          keyExtractor={(u, i) => `${u}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={renderItem}
          initialScrollIndex={safeInitial}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />

        {/* Bottom controls + thumbnails */}
        <View style={[styles.bottomWrap, { paddingBottom: bottomPad }]}>
          <View style={styles.bottomBar}>
            <Pressable
              onPress={() => goTo(idx - 1)}
              disabled={idx <= 0}
              style={({ pressed }) => [
                styles.navBtn,
                pressed && styles.pressed,
                idx <= 0 && styles.disabled,
              ]}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>

            <View style={styles.counter}>
              <Ionicons name="images-outline" size={16} color="rgba(255,255,255,0.75)" />
              <View style={{ width: 8 }} />
              <View>
                {/* simple counter */}
              </View>
            </View>

            <Pressable
              onPress={() => goTo(idx + 1)}
              disabled={idx >= urls.length - 1}
              style={({ pressed }) => [
                styles.navBtn,
                pressed && styles.pressed,
                idx >= urls.length - 1 && styles.disabled,
              ]}
              hitSlop={10}
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
          </View>

          {urls.length > 1 ? (
            <FlatList
              ref={thumbsRef}
              data={urls}
              keyExtractor={(u, i) => `thumb-${u}-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbList}
              renderItem={renderThumb}
              initialScrollIndex={safeInitial}
              getItemLayout={(_, index) => ({
                length: THUMB + 10,
                offset: (THUMB + 10) * index,
                index,
              })}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topCenter: { flex: 1, alignItems: "center" },
  titleWrap: { paddingHorizontal: 12 },

  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  image: {
    width: W,
    height: H * 0.78, // keep room for bars/thumbs
  },

  bottomWrap: {
    paddingTop: 10,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.25 },
  counter: { minWidth: 80, alignItems: "center", flexDirection: "row", justifyContent: "center" },

  thumbList: {
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 10,
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  thumbActive: {
    borderColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
});
