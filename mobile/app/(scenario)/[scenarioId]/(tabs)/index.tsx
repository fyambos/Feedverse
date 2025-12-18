import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { Post } from '@/components/Post';
import { Ionicons } from '@expo/vector-icons';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [storedPosts, setStoredPosts] = useState<any[]>([]);
  const [postsReady, setPostsReady] = useState(false);

  const sid = String(scenarioId ?? '');
  const STORAGE_KEY = `feedverse.posts.${sid}`;

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

  useFocusEffect(
    useCallback(() => {
      // refresh when returning from modals (e.g., create-post)
      void loadStoredPosts();
      return () => {};
    }, [loadStoredPosts])
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
      .filter((p) => p.scenarioId === sid)
      .filter((p) => !p.parentPostId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sid, storedPosts]);

  const profileById = useMemo(() => {
    const list = MOCK_PROFILES.filter((p) => p.scenarioId === sid);
    return new Map(list.map((p) => [p.id, p]));
  }, [sid]);
  const scale = React.useRef(new Animated.Value(1)).current;
  const navLock = React.useRef(false);

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
          const profile = profileById.get(item.authorProfileId);
          if (!profile) return null;

          return (
            <Pressable
              onPress={() =>
                router.push(`/(scenario)/${scenarioId}/(tabs)/post/${item.id}` as any)
              }
            >
              <Post
                profile={profile}
                item={item as any}
                variant="feed"
                showActions={true}
              />
            </Pressable>
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
