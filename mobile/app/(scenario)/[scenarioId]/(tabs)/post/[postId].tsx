import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { Post } from '@/components/Post';
import { useProfile } from '@/context/profile';

export default function PostScreen() {
  const { scenarioId, postId } = useLocalSearchParams<{ scenarioId: string; postId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { getProfileById } = useProfile();

  const sid = String(scenarioId ?? '');
  const pid = String(postId ?? '');

  const STORAGE_KEY = `feedverse.posts.${sid}`;

  const [storedPosts, setStoredPosts] = useState<any[]>([]);
  const [postsReady, setPostsReady] = useState(false);

  const loadStoredPosts = useCallback(async () => {
    try {
      setPostsReady(false);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setStoredPosts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setStoredPosts([]);
    } finally {
      setPostsReady(true);
    }
  }, [STORAGE_KEY]);

  useFocusEffect(
    useCallback(() => {
      void loadStoredPosts();
      return () => {};
    }, [loadStoredPosts])
  );

  const all = useMemo(() => {
    const mock = MOCK_FEEDS[sid] ?? [];
    const combined = [...storedPosts, ...mock];

    // de-dupe by id (prefer stored if duplicate)
    const byId = new Map<string, any>();
    for (const p of combined) {
      if (!p?.id) continue;
      const id = String(p.id);
      if (!byId.has(id)) byId.set(id, p);
    }

    return Array.from(byId.values()).filter((p) => String(p.scenarioId) === sid);
  }, [sid, storedPosts]);
  
  function buildThread(posts: any[], rootId: string) {
    const byParent = new Map<string, any[]>();

    posts.forEach((p) => {
      if (!p?.parentPostId) return;
      const key = String(p.parentPostId);
      if (!byParent.has(key)) {
        byParent.set(key, []);
      }
      byParent.get(key)!.push(p);
    });

    byParent.forEach(list =>
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );

    const result: any[] = [];

    function walk(parentId: string) {
      const children = byParent.get(parentId) ?? [];
      for (const child of children) {
        result.push(child);
        walk(String(child.id));
      }
    }

    walk(rootId);
    return result;
  }

  if (!postsReady) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  const root = all.find((p) => String(p.id) === pid);
  if (!root) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
        <ThemedText style={{ color: colors.textSecondary }}>
          Post not found.
        </ThemedText>
      </ThemedView>
    );
  }

  const replies = buildThread(all, String(root.id))
    .filter((p) => !!p.parentPostId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const data = [root, ...replies];


  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data}
        keyExtractor={(i: any) => String(i.id)}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => {
          const authorProfileId = item?.authorProfileId ? String(item.authorProfileId) : '';
          const profile = authorProfileId ? getProfileById(sid, authorProfileId) : null;
          if (!profile) return null;

          const parent = item.parentPostId
            ? all.find((p) => String(p.id) === String(item.parentPostId))
            : null;

          const parentAuthorProfileId = parent?.authorProfileId ? String(parent.authorProfileId) : '';
          const parentProfile = parentAuthorProfileId ? getProfileById(sid, parentAuthorProfileId) : null;

          return (
            <Post
              scenarioId={sid}
              profile={profile}
              item={item}
              variant={String(item.id) === String(root.id) ? 'detail' : 'reply'}
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
