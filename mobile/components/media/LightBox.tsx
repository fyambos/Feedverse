// mobile/components/media/Lightbox.tsx
import React from "react";
import {
  Modal,
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
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

export function Lightbox({
  urls,
  initialIndex,
  visible,
  onClose,
  title,
  allowSave = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = React.useState(Math.max(0, Math.min(initialIndex, urls.length - 1)));

  React.useEffect(() => {
    if (visible) {
      setIdx(Math.max(0, Math.min(initialIndex, urls.length - 1)));
    }
  }, [visible, initialIndex, urls.length]);

  const uri = urls[idx];

  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Top bar (SAFE AREA) */}
        <View style={[styles.topBar, { paddingTop: topPad, paddingHorizontal: 14 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.topCenter}>
            {!!title ? (
              <View style={styles.titleWrap}>
                {/* keep it simple, no themed components here */}
              </View>
            ) : null}
          </View>

          {allowSave ? (
            <Pressable
              onPress={() => (uri ? saveImageToDevice(uri) : null)}
              hitSlop={12}
              style={styles.iconBtn}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Image */}
        <View style={styles.imageWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : null}
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
          <Pressable
            onPress={() => setIdx((v) => Math.max(0, v - 1))}
            disabled={idx <= 0}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed, idx <= 0 && styles.disabled]}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>

          <View style={styles.counter}>
            {/* tiny counter */}
          </View>

          <Pressable
            onPress={() => setIdx((v) => Math.min(urls.length - 1, v + 1))}
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
      </View>
    </Modal>
  );
}

const { width, height } = Dimensions.get("window");

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

  imageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  image: {
    width: width,
    height: height,
  },

  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingHorizontal: 18,
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
  counter: { minWidth: 80, alignItems: "center" },
});
