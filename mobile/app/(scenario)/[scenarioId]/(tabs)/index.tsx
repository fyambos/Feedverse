import React, { useCallback, useMemo, useRef } from "react";
import { FlatList, StyleSheet, View, Pressable, Animated as RNAnimated } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Post as PostCard } from "@/components/post/Post";
import { useAuth } from "@/context/auth";
import { useAppData } from "@/context/appData";

import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

type SwipeRef = { current: any | null };

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const sid = String(scenarioId ?? "");

  const {
    isReady,
    listPostsForScenario,
    getProfileById,
    deletePost,
  } = useAppData();

  // --- posts from DB (top-level already)
  const posts = useMemo(() => {
    return isReady ? listPostsForScenario(sid) : [];
  }, [isReady, listPostsForScenario, sid]);

  const scale = React.useRef(new RNAnimated.Value(1)).current;
  const navLock = React.useRef(false);

  const swipeRefs = useRef(new Map<string, SwipeRef>()).current;

  const closeSwipe = useCallback(
    (postId: string) => {
      const refObj = swipeRefs.get(postId);
      const swipe = refObj?.current;
      if (swipe && typeof swipe.close === "function") swipe.close();
    },
    [swipeRefs]
  );

  const pressIn = () => {
    if (navLock.current) return;
    RNAnimated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    RNAnimated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  const openCreatePost = () => {
    if (navLock.current) return;
    navLock.current = true;

    router.push({
      pathname: "/modal/create-post",
      params: { scenarioId: sid },
    } as any);

    setTimeout(() => {
      navLock.current = false;
    }, 450);
  };

  const openEditPost = useCallback(
    (postId: string) => {
      router.push({
        pathname: "/modal/create-post",
        params: { scenarioId: sid, mode: "edit", postId: String(postId) },
      } as any);
    },
    [sid]
  );

  const onDeletePost = useCallback(
    async (postId: string) => {
      await deletePost(String(postId));
    },
    [deletePost]
  );

  const ACTIONS_WIDTH = 120;

  const RightActions = ({
    postId,
    dragX,
  }: {
    postId: string;
    dragX: { value: number };
  }) => {
    const rStyle = useAnimatedStyle(() => {
      const translateX = interpolate(dragX.value, [-ACTIONS_WIDTH, 0], [0, ACTIONS_WIDTH], "clamp");
      return { transform: [{ translateX }] };
    }, [dragX]);

    const pressedBg = colors.pressed;

    return (
      <Animated.View style={[styles.swipeActions, { width: ACTIONS_WIDTH }, rStyle]}>
        <Pressable
          onPress={() => {
            closeSwipe(postId);
            requestAnimationFrame(() => openEditPost(postId));
          }}
          style={({ pressed }) => [
            styles.swipeBtn,
            { backgroundColor: pressed ? pressedBg : "transparent", borderColor: colors.tint },
          ]}
          hitSlop={10}
        >
          <Ionicons name="pencil" size={22} color={colors.tint} />
        </Pressable>

        <Pressable
          onPress={() => {
            closeSwipe(postId);
            void onDeletePost(postId);
          }}
          style={({ pressed }) => [
            styles.swipeBtn,
            { backgroundColor: pressed ? pressedBg : "transparent", borderColor: "#F04438" },
          ]}
          hitSlop={10}
        >
          <Ionicons name="trash-outline" size={22} color="#F04438" />
        </Pressable>
      </Animated.View>
    );
  };

  const openPostDetail = useCallback(
    (postId: string) => {
      router.push(`/(scenario)/${sid}/(tabs)/post/${String(postId)}` as any);
    },
    [sid]
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => {
          const profile = getProfileById(String(item.authorProfileId));
          if (!profile) return null;

          const canEdit = profile.ownerUserId === userId || !!profile.isPublic;

          const content = (
            <Pressable
              onPress={() => {
                closeSwipe(String(item.id));
                openPostDetail(String(item.id));
              }}
            >
              <PostCard scenarioId={sid} profile={profile as any} item={item as any} variant="feed" showActions />
            </Pressable>
          );

          if (!canEdit) return content;

          let swipeRef = swipeRefs.get(String(item.id));
          if (!swipeRef) {
            swipeRef = { current: null };
            swipeRefs.set(String(item.id), swipeRef);
          }

          return (
            <ReanimatedSwipeable
              ref={swipeRef as any}
              overshootRight={false}
              friction={2}
              rightThreshold={24}
              renderRightActions={(_progress, dragX) => (
                <RightActions postId={String(item.id)} dragX={dragX as any} />
              )}
            >
              {content}
            </ReanimatedSwipeable>
          );
        }}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <View style={{ gap: 6 }}>
              <Pressable onPress={openCreatePost} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    borderRadius: 16,
                    padding: 14,
                    backgroundColor: colors.card,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="add" size={18} color={colors.tint} />
                    <ThemedText style={{ color: colors.text, fontWeight: "800" }}>
                      Create your first post
                    </ThemedText>
                  </View>
                  <ThemedText style={{ color: colors.textSecondary, marginTop: 6 }}>
                    Nothing here yet — post something to start the feed.
                  </ThemedText>
                </View>
              </Pressable>
            </View>
          </View>
        )}
      />

      <RNAnimated.View
        style={[
          styles.fab,
          { backgroundColor: colors.tint, transform: [{ scale }] },
        ]}
      >
        <Pressable
          onPress={openCreatePost}
          onPressIn={pressIn}
          onPressOut={pressOut}
          hitSlop={16}
          style={styles.fabPress}
          disabled={navLock.current}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </Pressable>
      </RNAnimated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
  swipeActions: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 12,
    gap: 10,
  },
  swipeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPress: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
