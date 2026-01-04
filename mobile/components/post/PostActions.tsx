// mobile/components/post/PostActions.tsx
import React from "react";
import { Animated, Pressable, StyleSheet, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SimpleLineIcons from "@expo/vector-icons/SimpleLineIcons";
import AntDesign from "@expo/vector-icons/AntDesign";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/themed-text";
import { formatCount } from "@/lib/format";
import { Alert } from "@/context/dialog";

type ColorsLike = {
  icon: string;
  textSecondary: string;
  tint: string; // your blue
  pressed: string;
};

type Props = {
  variant: "feed" | "detail" | "reply";
  colors: ColorsLike;

  replyCount?: number;
  repostCount?: number;
  likeCount?: number;

  onReply: () => void;
  onQuote: () => void;

  onLike?: () => void;
  isLiked?: boolean;

  onRepost?: () => void | Promise<void>;
  isReposted?: boolean;

  onShare?: () => void;
};

function RepostIconStatic({ color }: { color: string }) {
  if (Platform.OS === "ios") {
    return <IconSymbol name="arrow.2.squarepath" size={23} color={color} />;
  }
  return <AntDesign name="retweet" size={20} color={color} />;
}

export function PostActions({
  variant,
  colors,
  replyCount = 0,
  repostCount = 0,
  likeCount = 0,
  onReply,
  onQuote,

  onLike,
  isLiked = false,

  onRepost,
  isReposted = false,

  onShare,
}: Props) {
  const isDetail = variant === "detail";
  const showActionCounts = !isDetail;

  const replyScale = React.useRef(new Animated.Value(1)).current;
  const repostScale = React.useRef(new Animated.Value(1)).current;
  const likeScale = React.useRef(new Animated.Value(1)).current;
  const shareScale = React.useRef(new Animated.Value(1)).current;

  const likeBurst = React.useRef(new Animated.Value(0)).current;

  const repostTint = React.useRef(new Animated.Value(isReposted ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(repostTint, {
      toValue: isReposted ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isReposted, repostTint]);

  const pop = (v: Animated.Value) => {
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
  };

  const likePop = (goingToLiked: boolean) => {
    likeScale.setValue(1);

    if (goingToLiked) {
      Animated.sequence([
        Animated.timing(likeScale, { toValue: 0.86, duration: 60, useNativeDriver: true }),
        Animated.spring(likeScale, { toValue: 1.1, friction: 4, tension: 240, useNativeDriver: true }),
        Animated.spring(likeScale, { toValue: 1, friction: 4, tension: 240, useNativeDriver: true }),
      ]).start();

      likeBurst.setValue(0);
      Animated.timing(likeBurst, { toValue: 1, duration: 260, useNativeDriver: true }).start(() => {
        likeBurst.setValue(0);
      });
    } else {
      Animated.sequence([
        Animated.timing(likeScale, { toValue: 0.92, duration: 60, useNativeDriver: true }),
        Animated.spring(likeScale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
      ]).start();
    }
  };

  const comingSoon = (feature: string) => {
    Alert.alert("Coming soon", `${feature} is not available yet.`);
  };

  // Optimistic UI: update instantly on press even if parent FlatList row is memoized.
  const [likedLocal, setLikedLocal] = React.useState<boolean>(!!isLiked);
  React.useEffect(() => {
    setLikedLocal(!!isLiked);
  }, [isLiked]);

  const likeColor = likedLocal ? "#ff2d55" : colors.icon;

  const burstScale = likeBurst.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.6],
  });

  const burstOpacity = likeBurst.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.35, 0],
  });

  const repostOnOpacity = repostTint; // 0..1
  const repostOffOpacity = repostTint.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const showRepostCount = showActionCounts && repostCount > 0;

  return (
    <View style={[styles.actions, isDetail ? styles.actionsDetail : styles.actionsReply]}>
      {/* Reply */}
      <View style={styles.actionSlot}>
        <View style={[styles.action, styles.replyActionNudge]}>
          <View style={styles.iconBox}>
            <Pressable
              onPress={() => {
                pop(replyScale);
                onReply();
              }}
              hitSlop={6}
              pressRetentionOffset={6}
              style={styles.iconPressable}
              accessibilityRole="button"
              accessibilityLabel="Reply"
            >
              <Animated.View style={[styles.replyIconNudge, { transform: [{ scale: replyScale }] }]}>
                <SimpleLineIcons name="bubble" size={20} color={colors.icon} />
              </Animated.View>
            </Pressable>
          </View>

          {showActionCounts ? (
            <ThemedText
              style={[
                styles.actionCount,
                styles.actionCountNudge,
                { color: colors.textSecondary, opacity: replyCount > 0 ? 1 : 0 },
              ]}
            >
              {replyCount > 0 ? formatCount(replyCount) : "0"}
            </ThemedText>
          ) : (
            <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
          )}
        </View>
      </View>

      {/* Repost / Quote */}
      <View style={styles.actionSlot}>
        <View style={styles.action}>
          <Pressable
            onPress={() => {
              pop(repostScale);
              if (onRepost) onRepost();
              else comingSoon("Reposting");
            }}
            onLongPress={() => {
              pop(repostScale);
              onQuote();
            }}
            delayLongPress={250}
            hitSlop={6}
            pressRetentionOffset={6}
            style={styles.iconPressable}
            accessibilityRole="button"
            accessibilityLabel="Repost"
          >
            <Animated.View style={{ transform: [{ scale: repostScale }] }}>
              <View style={styles.repostIconStack}>
                {/* OFF (grey) */}
                <Animated.View style={{ opacity: repostOffOpacity }}>
                  <RepostIconStatic color={colors.icon} />
                </Animated.View>

                {/* ON (tinted) */}
                <Animated.View style={[styles.repostIconOn, { opacity: repostOnOpacity }]}>
                  <RepostIconStatic color={colors.tint} />
                </Animated.View>
              </View>
            </Animated.View>
          </Pressable>

          {/* Repost count */}
          {showActionCounts ? (
            <View style={styles.repostCountStack}>
              <Animated.Text
                style={[
                  styles.actionCount,
                  styles.actionCountNudge,
                  { color: colors.textSecondary, opacity: showRepostCount ? (repostOffOpacity as any) : 0 },
                ]}
              >
                {showRepostCount ? formatCount(repostCount) : "0"}
              </Animated.Text>

              <Animated.Text
                style={[
                  styles.actionCount,
                  styles.repostCountOn,
                  styles.actionCountNudge,
                  { color: colors.tint, opacity: showRepostCount ? (repostOnOpacity as any) : 0 },
                ]}
              >
                {showRepostCount ? formatCount(repostCount) : "0"}
              </Animated.Text>
            </View>
          ) : (
            <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
          )}
        </View>
      </View>

      {/* Like */}
      <View style={styles.actionSlot}>
        <View style={styles.action}>
          <Pressable
            onPress={() => {
              const goingToLiked = !likedLocal;
              likePop(goingToLiked);
              setLikedLocal(goingToLiked);

              if (onLike) onLike();
              else comingSoon("Liking");
            }}
            hitSlop={6}
            pressRetentionOffset={6}
            style={styles.iconPressable}
            accessibilityRole="button"
            accessibilityLabel="Like"
          >
            <View style={styles.likeIconWrap}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.likeBurst,
                  {
                    opacity: burstOpacity,
                    transform: [{ scale: burstScale }],
                    borderColor: likeColor,
                  },
                ]}
              />

              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons name={likedLocal ? "heart" : "heart-outline"} size={22} color={likeColor} />
              </Animated.View>
            </View>
          </Pressable>

          {showActionCounts ? (
            <ThemedText
              style={[
                styles.actionCount,
                styles.actionCountNudge,
                { color: colors.textSecondary, opacity: likeCount > 0 ? 1 : 0 },
              ]}
            >
              {likeCount > 0 ? formatCount(likeCount) : "0"}
            </ThemedText>
          ) : (
            <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
          )}
        </View>
      </View>

      {/* Share */}
      <View style={styles.actionSlot}>
        <View style={styles.action}>
          <View style={styles.iconBox}>
            <Pressable
              onPress={() => {
                pop(shareScale);
                onShare?.(); // if undefined => does nothing
              }}
              hitSlop={6}
              pressRetentionOffset={6}
              style={styles.iconPressable}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Animated.View style={{ transform: [{ scale: shareScale }] }}>
                <Ionicons name="share-outline" size={22} color={colors.icon} />
              </Animated.View>
            </Pressable>
          </View>

          <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "space-between" },
  actionsReply: { paddingVertical: 0 },
  actionsDetail: { paddingVertical: 8, paddingTop: 4 },

  actionSlot: { flex: 1, alignItems: "center" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  actionCount: { fontSize: 14, minWidth: 44, textAlign: "left" },
  iconPressable: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 999,
  },

  repostIconStack: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  repostIconOn: { position: "absolute" },

  repostCountStack: { minWidth: 18, alignItems: "flex-start", justifyContent: "center" },
  repostCountOn: { position: "absolute", left: 0 },

  likeIconWrap: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  likeBurst: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
  },

  iconBox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  replyActionNudge: {
    transform: [{ translateY: 1.5 }],
  },

  replyIconNudge: {
    transform: [{ translateY: 1 }],
  },
  actionCountNudge: {
    transform: [{ translateX: -4 }],
  },
});