// mobile/components/media/MediaGrid.tsx
import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type MediaVariant = "feed" | "detail" | "reply";

function normalizeUrls(urls?: string[], max = 4): string[] {
  return (urls ?? [])
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, max);
}

type CellProps = {
  uri: string;
  idx: number;
  style?: StyleProp<ViewStyle>;
  onOpen: (index: number) => void;
  backgroundColor: string;
};

function Cell({ uri, idx, style, onOpen, backgroundColor }: CellProps) {
  return (
    <Pressable onPress={() => onOpen(idx)} style={style} hitSlop={2}>
      <Image
        source={{ uri }}
        style={[styles.mediaCell, { backgroundColor }]}
        resizeMode="cover"
      />
    </Pressable>
  );
}

type Props = {
  urls?: string[];
  variant: MediaVariant;
  onOpen: (index: number) => void;
  backgroundColor?: string;
};

export function MediaGrid({
  urls,
  variant,
  onOpen,
  backgroundColor = "#111",
}: Props) {
  const u = normalizeUrls(urls, 4);
  if (u.length === 0) return null;

  const isDetail = variant === "detail";
  const h = isDetail ? 260 : 220;
  const gap = 2;

  if (u.length === 1) {
    return (
      <Pressable onPress={() => onOpen(0)} hitSlop={2}>
        <Image
          source={{ uri: u[0] }}
          style={[styles.mediaSingle, { height: h, backgroundColor }]}
          resizeMode="cover"
        />
      </Pressable>
    );
  }

  if (u.length === 2) {
    return (
      <View style={[styles.mediaGrid, { height: h }]}>
        <View style={[styles.mediaRow, { gap }]}>
          <Cell
            uri={u[0]}
            idx={0}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
          <Cell
            uri={u[1]}
            idx={1}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
        </View>
      </View>
    );
  }

  if (u.length === 3) {
    return (
      <View style={[styles.mediaGrid, { height: h }]}>
        <View style={[styles.mediaRow, { gap }]}>
          <Cell
            uri={u[0]}
            idx={0}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
          <View style={[styles.mediaCol, { flex: 1, gap }]}>
            <Cell
              uri={u[1]}
              idx={1}
              onOpen={onOpen}
              backgroundColor={backgroundColor}
              style={[styles.mediaCellWrap, { flex: 1 }]}
            />
            <Cell
              uri={u[2]}
              idx={2}
              onOpen={onOpen}
              backgroundColor={backgroundColor}
              style={[styles.mediaCellWrap, { flex: 1 }]}
            />
          </View>
        </View>
      </View>
    );
  }

  // 4
  return (
    <View style={[styles.mediaGrid, { height: h }]}>
      <View style={[styles.mediaCol, { gap }]}>
        <View style={[styles.mediaRow, { flex: 1, gap }]}>
          <Cell
            uri={u[0]}
            idx={0}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
          <Cell
            uri={u[1]}
            idx={1}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
        </View>
        <View style={[styles.mediaRow, { flex: 1, gap }]}>
          <Cell
            uri={u[2]}
            idx={2}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
          <Cell
            uri={u[3]}
            idx={3}
            onOpen={onOpen}
            backgroundColor={backgroundColor}
            style={[styles.mediaCellWrap, { flex: 1 }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mediaSingle: {
    marginTop: 10,
    width: "100%",
    borderRadius: 16,
  },
  mediaGrid: {
    marginTop: 10,
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  mediaRow: { flexDirection: "row", flex: 1 },
  mediaCol: { flexDirection: "column", flex: 1 },
  mediaCellWrap: { overflow: "hidden" },
  mediaCell: { width: "100%", height: "100%" },
});
