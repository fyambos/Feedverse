import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { DEFAULT_TINT_COLOR } from "@/constants/theme";

export default function BootSplash() {
  return (
    <View style={styles.root}>
      <View style={styles.iconFrame}>
        <Image
          source={require("../../assets/images/FeedverseIcon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const ICON_SIZE = 140;
const OUTLINE = 8;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DEFAULT_TINT_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  iconFrame: {
    width: ICON_SIZE + OUTLINE * 2,
    height: ICON_SIZE + OUTLINE * 2,
    borderRadius: (ICON_SIZE + OUTLINE * 2) / 2,
    borderWidth: OUTLINE,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DEFAULT_TINT_COLOR,
    overflow: "hidden",
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
  },
});
