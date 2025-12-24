// mobile/app/(scenario)/[scenarioId]/(tabs)/index.tsx
import React, { useCallback, useMemo } from "react";
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

import { SwipeableRow } from "@/components/ui/SwipeableRow";

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const sid = String(scenarioId ?? "");

  const { isReady, listPostsForScenario, getProfileById, deletePost } = useAppData();

  // --- posts from DB (top-level already)
  const posts = useMemo(() => {
    return isReady ? listPostsForScenario(sid) : [];
  }, [isReady, listPostsForScenario, sid]);

  const scale = React.useRef(new RNAnimated.Value(1)).current;
  const navLock = React.useRef(false);

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
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        renderItem={({ item }) => {
          const profile = getProfileById(String(item.authorProfileId));
          if (!profile) return null;

          const canEdit = profile.ownerUserId === userId || !!profile.isPublic;

          const content = (
            <Pressable
              onPress={() => {
                openPostDetail(String(item.id));
              }}
            >
              <PostCard
                scenarioId={sid}
                profile={profile as any}
                item={item as any}
                variant="feed"
                showActions
              />
            </Pressable>
          );

          return (
            <SwipeableRow
              enabled={canEdit}
              colors={colors}
              rightThreshold={24}
              onEdit={() => openEditPost(String(item.id))}
              onDelete={() => onDeletePost(String(item.id))}
            >
              {content}
            </SwipeableRow>
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

      <RNAnimated.View style={[styles.fab, { backgroundColor: colors.tint, transform: [{ scale }] }]}>
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
