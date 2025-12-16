import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { Post } from '@/components/Post';

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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
});
