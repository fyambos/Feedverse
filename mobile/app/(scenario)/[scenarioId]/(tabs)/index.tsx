import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { Post } from '@/components/Post';
import { useProfile } from '@/context/profile';
import { useAuth } from '@/context/auth';
import { Ionicons } from '@expo/vector-icons';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const [storedPosts, setStoredPosts] = useState<any[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [postsReady, setPostsReady] = useState(false);

  const sid = String(scenarioId ?? '');
  const { getProfileById } = useProfile();
  const STORAGE_KEY = `feedverse.posts.${sid}`;
  const DELETED_KEY = `feedverse.posts.deleted.${sid}`;

  const loadStoredPosts = useCallback(async () => {
    try {
      setPostsReady(false);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      setStoredPosts(list);
    } catch {
      setStoredPosts([]);
    } finally {
      setPostsReady(true);
    }
  }, [STORAGE_KEY]);

  const loadDeletedIds = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DELETED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
      setDeletedIds(list);
    } catch {
      setDeletedIds([]);
    }
  }, [DELETED_KEY]);

  useFocusEffect(
    useCallback(() => {
      // refresh when returning from modals (e.g., create-post)
      void loadStoredPosts();
      void loadDeletedIds();
      return () => {};
    }, [loadStoredPosts, loadDeletedIds])
  );

  const posts = useMemo(() => {
    const mock = MOCK_FEEDS[sid] ?? [];
    const combined = [...storedPosts, ...mock];

    // de-dupe by id (prefer stored version if same id)
    const byId = new Map<string, any>();
    for (const p of combined) {
      if (!p?.id) continue;
      if (!byId.has(p.id)) byId.set(p.id, p);
    }

    return Array.from(byId.values())
      .filter((p) => !deletedIds.includes(p.id))
      .filter((p) => p.scenarioId === sid)
      .filter((p) => !p.parentPostId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sid, storedPosts, deletedIds]);

  const scale = React.useRef(new Animated.Value(1)).current;
  const navLock = React.useRef(false);

  const swipeRefs = useRef(new Map<string, any>()).current;

  const closeSwipe = useCallback((postId: string) => {
    const ref = swipeRefs.get(postId);
    if (ref && typeof (ref as any).close === 'function') {
      (ref as any).close();
    }
  }, [swipeRefs]);

  const pressIn = () => {
    if (navLock.current) return;
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const openCreatePost = () => {
    if (navLock.current) return;
    navLock.current = true;

    router.push({
      pathname: '/modal/create-post',
      params: { scenarioId: String(scenarioId) },
    } as any);

    // prevent double-open (fast double tap)
    setTimeout(() => {
      navLock.current = false;
    }, 450);
  };

  const deletePost = useCallback(
    async (postId: string) => {
      // 1) remove from stored posts if present
      const nextStored = storedPosts.filter((p) => p?.id !== postId);
      if (nextStored.length !== storedPosts.length) {
        setStoredPosts(nextStored);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStored));
        return;
      }

      // 2) otherwise, hide mock posts via a deleted-ids list
      if (!deletedIds.includes(postId)) {
        const nextDeleted = [postId, ...deletedIds];
        setDeletedIds(nextDeleted);
        await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(nextDeleted));
      }
    },
    [storedPosts, deletedIds, STORAGE_KEY, DELETED_KEY]
  );

  const openEditPost = useCallback(
    (postId: string) => {
      router.push({
        pathname: '/modal/create-post',
        params: { scenarioId: String(scenarioId), postId },
      } as any);
    },
    [scenarioId]
  );

  const renderRightActions = useCallback(
    (postId: string, _progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const ACTIONS_WIDTH = 120; // enough for 2 circular buttons + gap + padding

      // dragX: 0 -> negative as you swipe left
      // keep the actions view off-screen until you drag
      const translateX = dragX.interpolate({
        inputRange: [-ACTIONS_WIDTH, 0],
        outputRange: [0, ACTIONS_WIDTH],
        extrapolate: 'clamp',
      });

      const pressedBg = colors.pressed;

      return (
        <Animated.View
          style={[
            styles.swipeActions,
            {
              width: ACTIONS_WIDTH,
              transform: [{ translateX }],
            },
          ]}
        >
          <Pressable
            onPress={() => {
              closeSwipe(postId);
              // let the row settle back before navigation
              requestAnimationFrame(() => openEditPost(postId));
            }}
            style={({ pressed }) => [
              styles.swipeBtn,
              {
                backgroundColor: pressed ? pressedBg : 'transparent',
                borderColor: colors.tint,
              },
            ]}
            hitSlop={10}
          >
            <Ionicons name="pencil" size={22} color={colors.tint} />
          </Pressable>

          <Pressable
            onPress={() => {
              closeSwipe(postId);
              void deletePost(postId);
            }}
            style={({ pressed }) => [
              styles.swipeBtn,
              {
                backgroundColor: pressed ? pressedBg : 'transparent',
                borderColor: '#F04438',
              },
            ]}
            hitSlop={10}
          >
            <Ionicons name="trash-outline" size={22} color="#F04438" />
          </Pressable>
        </Animated.View>
      );
    },
    [colors.pressed, colors.tint, deletePost, openEditPost, closeSwipe]
  );

  const openPostDetail = useCallback(
    (postId: string) => {
      router.push(`/(scenario)/${scenarioId}/(tabs)/post/${postId}` as any);
    },
    [scenarioId]
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        extraData={postsReady}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        renderItem={({ item }) => {
          const profile = getProfileById(sid, item.authorProfileId);
          if (!profile) return null;

          const canEdit =
            (profile as any).ownerUserId === userId || !!(profile as any).isPublic;

          const content = (
            <Pressable
              onPress={() => {
                closeSwipe(item.id);
                openPostDetail(item.id);
              }}
            >
              <Post
                scenarioId={sid}
                profile={profile as any}
                item={item as any}
                variant="feed"
                showActions={true}
              />
            </Pressable>
          );

          if (!canEdit) return content;

          return (
            <Swipeable
              ref={(ref) => {
                swipeRefs.set(item.id, ref);
              }}
              overshootRight={false}
              friction={2}
              rightThreshold={24}
              renderRightActions={(progress, dragX) =>
                renderRightActions(item.id, progress, dragX)
              }
            >
              {content}
            </Swipeable>
          );
        }}
      />
      <Animated.View
        style={[
          styles.fab,
          {
            backgroundColor: colors.tint,
            transform: [{ scale }],
          },
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
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
  swipeActions: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 12,
    gap: 10,
  },
  swipeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  fab: {
  position: 'absolute',
  right: 20,
  bottom: 24,
  width: 56,
  height: 56,
  borderRadius: 28,
  alignItems: 'center',
  justifyContent: 'center',

  // iOS shadow
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 4 },

  // Android
  elevation: 6,
  },
  fabPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
