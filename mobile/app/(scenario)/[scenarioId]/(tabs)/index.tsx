import React, { useMemo } from 'react';
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

export default function HomeScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const posts = (MOCK_FEEDS[scenarioId ?? ''] ?? [])
    .filter((p) => p.scenarioId === scenarioId)
    .filter((p) => !p.parentPostId);

  const profileById = useMemo(() => {
    const sid = scenarioId ?? '';
    const list = MOCK_PROFILES.filter((p) => p.scenarioId === sid);
    return new Map(list.map((p) => [p.id, p]));
  }, [scenarioId]);
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
