import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { subscribeToNotifications } from "@/context/appData";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export default function NotificationBanner() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const router = useRouter();
  const [notif, setNotif] = useState<any | null>(null);
  const anim = useRef(new Animated.Value(0)).current; // 0 hidden, 1 visible
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeToNotifications((n) => {
      // show latest notification
      setNotif(n);
    });
    return () => {
      try { unsub(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!notif) return;

    // animate in
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setNotif(null));
      timeoutRef.current = null;
    }, 4200) as unknown as number;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [notif, anim]);

  if (!notif) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-80, 8] });

  return (
    <Animated.View
      pointerEvents={"box-none"}
      style={[styles.wrap, { transform: [{ translateY }], backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Pressable
        onPress={() => {
          try {
            const sid = String(notif.scenarioId ?? "");
            const conv = String(notif.conversationId ?? "");
            if (sid && conv) {
              router.push({ pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]", params: { scenarioId: sid, conversationId: conv } } as any);
            }
          } catch {}
          Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setNotif(null));
        }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{String(notif.title ?? "Notification")}</Text>
          {notif.body ? <Text numberOfLines={2} style={[styles.body, { color: colors.textSecondary }]}>{String(notif.body)}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 0,
    zIndex: 9999,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  card: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  title: {
    fontWeight: "800",
    fontSize: 14,
  },
  body: {
    marginTop: 4,
    fontSize: 13,
  },
});
