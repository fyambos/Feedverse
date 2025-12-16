import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { Post } from '@/components/Post';

export default function PostScreen() {
  const { scenarioId, postId } = useLocalSearchParams<{ scenarioId: string; postId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const all = MOCK_FEEDS[scenarioId ?? ''] ?? [];
  
  function buildThread(posts: any[], rootId: string) {
    const byParent = new Map<string, any[]>();

    posts.forEach(p => {
      if (!p.parentPostId) return;
      if (!byParent.has(p.parentPostId)) {
        byParent.set(p.parentPostId, []);
      }
      byParent.get(p.parentPostId)!.push(p);
    });

    byParent.forEach(list =>
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );

    const result: any[] = [];

    function walk(parentId: string) {
      const children = byParent.get(parentId) ?? [];
      for (const child of children) {
        result.push(child);
        walk(child.id);
      }
    }

    walk(rootId);
    return result;
  }

  const profileById = useMemo(() => {
    const list = MOCK_PROFILES.filter((p) => p.scenarioId === (scenarioId ?? ''));
    return new Map(list.map((p) => [p.id, p]));
  }, [scenarioId]);

  const root = all.find((p) => p.id === postId);
  if (!root) return null;

  const replies = buildThread(all, root.id)
    .filter((p) => p.parentPostId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const data = [root, ...replies];

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => {
          const profile = profileById.get(item.authorProfileId);
          if (!profile) return null;

          const parent =
            item.parentPostId
              ? all.find(p => p.id === item.parentPostId)
              : null;

          const parentProfile =
            parent ? profileById.get(parent.authorProfileId) : null;

          return (
            <Post
              profile={profile}
              item={item}
              variant={item.id === root.id ? 'detail' : 'reply'}
              replyingTo={parentProfile?.handle}
              showActions
            />
          );
        }}

      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sep: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
});
