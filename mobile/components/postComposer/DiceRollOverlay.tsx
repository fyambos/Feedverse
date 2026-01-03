import React from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { ThemedText } from "@/components/themed-text";

type ColorsLike = {
  background: string;
  border: string;
  text: string;
  textSecondary: string;
  pressed: string;
  tint?: string;
  card?: string;
};

export function DiceRollOverlay({
  visible,
  colors,
  finalValue,
}: {
  visible: boolean;
  colors: ColorsLike;
  finalValue: number;
}) {
  const rotate = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const popScale = React.useRef(new Animated.Value(0.2)).current;
  const popOpacity = React.useRef(new Animated.Value(0)).current;

  const [displayValue, setDisplayValue] = React.useState(() => clampD20(finalValue));

  React.useEffect(() => {
    if (!visible) return;

    setDisplayValue(clampD20(finalValue));

    popScale.setValue(0.2);
    popOpacity.setValue(0);

    rotate.setValue(0);
    pulse.setValue(0);

    const spin = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    spin.start();
    bounce.start();

    // Rapidly “roll” numbers then settle.
    const settleMs = 650;
    const tickMs = 65;

    const endAt = Date.now() + settleMs;
    const interval = setInterval(() => {
      if (Date.now() >= endAt) {
        setDisplayValue(clampD20(finalValue));

        // Big "landed" pop.
        popScale.setValue(0.2);
        popOpacity.setValue(0);
        Animated.sequence([
          Animated.parallel([
            Animated.timing(popOpacity, {
              toValue: 1,
              duration: 110,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(popScale, {
              toValue: 1.18,
              duration: 200,
              easing: Easing.out(Easing.back(1.6)),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(popScale, {
            toValue: 1,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(450),
          Animated.timing(popOpacity, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();

        clearInterval(interval);
        return;
      }

      setDisplayValue(randD20());
    }, tickMs);

    return () => {
      clearInterval(interval);
      spin.stop();
      bounce.stop();
    };
  }, [visible, finalValue, rotate, pulse, popOpacity, popScale]);

  if (!visible) return null;

  const spinDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Keep the number upright while the die spins.
  const counterSpinDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const faceBg = colors.card ?? colors.background;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Animated.View style={[styles.dieWrap, { transform: [{ rotate: spinDeg }, { scale }] }]}>
        <View style={[styles.dieFace, { backgroundColor: faceBg, borderColor: colors.border }]}>
          <Animated.View style={{ transform: [{ rotate: counterSpinDeg }] }}>
            <ThemedText style={[styles.dieLabel, { color: colors.textSecondary }]}>d20</ThemedText>
            <Text style={[styles.dieValue, { color: colors.text }]}>{displayValue}</Text>
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.popWrap,
          {
            opacity: popOpacity,
            transform: [{ scale: popScale }],
          },
        ]}
      >
        <Text style={[styles.popValue, { color: colors.text }]}>{displayValue}</Text>
      </Animated.View>

      <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>Rolling…</ThemedText>
    </View>
  );
}

function clampD20(n: number) {
  const x = Number.isFinite(n) ? Math.floor(n) : 1;
  return Math.max(1, Math.min(20, x));
}

function randD20() {
  return Math.floor(Math.random() * 20) + 1;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  dieWrap: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
  },
  dieFace: {
    width: 104,
    height: 104,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dieLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  dieValue: {
    fontSize: 42,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  popWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  popValue: {
    fontSize: 84,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
  },
});
