import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { Post } from '@/components/Post';
import { useProfile } from '@/context/profile';
import { useAuth } from '@/context/auth';

export default function PostScreen() {
  const { scenarioId, postId } = useLocalSearchParams<{ scenarioId: string; postId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { getProfileById } = useProfile();
  const { userId } = useAuth();
  const swipeRefs = useRef(new Map<string, any>()).current;

  const sid = String(scenarioId ?? '');
  const pid = String(postId ?? '');

  const STORAGE_KEY = `feedverse.posts.${sid}`;
  const DELETED_KEY = `feedverse.posts.deleted.${sid}`;

  const [storedPosts, setStoredPosts] = useState<any[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

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

    return Array.from(byId.values())
      .filter((p) => String(p.scenarioId) === sid)
      .filter((p) => !deletedIds.includes(String(p.id)));
  }, [sid, storedPosts, deletedIds]);

     const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>({});
    const avatarKeyForProfile = useCallback(
      (profileHandle: string) => `feedverse.profile.avatar.${sid}.${profileHandle}`,
      [sid]
    );

    const loadAvatarOverrides = useCallback(async () => {
      try {
        // collect all profileIds we will display in this thread
        const ids = new Set<string>();
        for (const p of all) {
          if (p?.authorProfileId) ids.add(String(p.authorProfileId));
        }

        const next: Record<string, string> = {};

        // resolve handle for each profileId, then load its stored avatar key
        await Promise.all(
          Array.from(ids).map(async (profileId) => {
            const prof = getProfileById(sid, profileId);
            if (!prof?.handle) return;

            const uri = await AsyncStorage.getItem(avatarKeyForProfile(String(prof.handle)));
            if (uri) next[profileId] = uri;
          })
        );

        setAvatarOverrides(next);
      } catch {
        setAvatarOverrides({});
      }
    }, [all, sid, getProfileById, avatarKeyForProfile]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadStoredPosts();
        await loadDeletedIds();
      })();
      return () => {};
    }, [loadStoredPosts, loadDeletedIds])
  );

  // whenever the thread content changes, refresh overrides
  useEffect(() => {
    void loadAvatarOverrides();
  }, [loadAvatarOverrides]);

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

  const closeSwipe = useCallback(
    (postId: string) => {
      const ref = swipeRefs.get(postId);
      if (ref && typeof (ref as any).close === 'function') {
        (ref as any).close();
      }
    },
    [swipeRefs]
  );

  const deletePost = useCallback(
    async (postId: string) => {
      // 1) remove from stored posts if present
      const nextStored = storedPosts.filter((p) => String(p?.id) !== String(postId));
      if (nextStored.length !== storedPosts.length) {
        setStoredPosts(nextStored);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStored));
        return;
      }

      // 2) otherwise, hide mock posts via a deleted-ids list
      if (!deletedIds.includes(String(postId))) {
        const nextDeleted = [String(postId), ...deletedIds];
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
        params: { scenarioId: sid, postId: String(postId) },
      } as any);
    },
    [sid]
  );

  const RightActions = ({
    postId,
    dragX,
  }: {
    postId: string;
    dragX: any;
  }) => {
    const ACTIONS_WIDTH = 120;

    const animatedStyle = useAnimatedStyle(() => {
      // dragX.value: 0 -> negative as you swipe left
      const translateX = interpolate(
        dragX.value,
        [-ACTIONS_WIDTH, 0],
        [0, ACTIONS_WIDTH],
        Extrapolation.CLAMP
      );

      return {
        transform: [{ translateX }],
      };
    });

    const pressedBg = colors.pressed;
 
    return (
      <Animated.View
        style={[
          styles.swipeActions,
          {
            width: ACTIONS_WIDTH,
          },
          animatedStyle,
        ]}
      >
        <Pressable
          onPress={() => {
            closeSwipe(String(postId));
            requestAnimationFrame(() => openEditPost(String(postId)));
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
            closeSwipe(String(postId));
            void deletePost(String(postId));
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
  };

  const renderRightActions = useCallback(
    (postId: string, _progress: any, dragX: any) => {
      return <RightActions postId={String(postId)} dragX={dragX} />;
    },
    [colors.pressed, colors.tint, closeSwipe, deletePost, openEditPost]
  );

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
          const itemId = String(item.id);
          const authorProfileId = item?.authorProfileId ? String(item.authorProfileId) : '';
          const rawProfile = authorProfileId ? getProfileById(sid, authorProfileId) : null;
          if (!rawProfile) return null;

          const override = avatarOverrides[authorProfileId];
          const profile = override ? { ...(rawProfile as any), avatarUrl: override } : rawProfile;          if (!profile) return null;

          const parent = item.parentPostId
            ? all.find((p) => String(p.id) === String(item.parentPostId))
            : null;

          const parentAuthorProfileId = parent?.authorProfileId ? String(parent.authorProfileId) : '';
          const rawParentProfile =
            parentAuthorProfileId ? getProfileById(sid, parentAuthorProfileId) : null;

          const parentOverride = parentAuthorProfileId ? avatarOverrides[parentAuthorProfileId] : undefined;
          const parentProfile =
            rawParentProfile && parentOverride
              ? { ...(rawParentProfile as any), avatarUrl: parentOverride }
              : rawParentProfile;
          const isRoot = String(item.id) === String(root.id);
          const variant = isRoot ? 'detail' : 'reply';

          const canEdit =
            (profile as any).ownerUserId === userId || !!(profile as any).isPublic;

          const content = (
            <Post
              scenarioId={sid}
              profile={profile}
              item={item}
              variant={variant}
              replyingTo={parentProfile?.handle}
              showActions
            />
          );

          if (!canEdit) return content;

          let swipeRef = swipeRefs.get(itemId);
          if (!swipeRef) {
            swipeRef = { current: null };
            swipeRefs.set(itemId, swipeRef);
          }

          return (
            <ReanimatedSwipeable
              ref={swipeRef as any}
              overshootRight={false}
              friction={2}
              rightThreshold={24}
              renderRightActions={(progress, dragX) =>
                renderRightActions(itemId, progress, dragX)
              }
            >
              {content}
            </ReanimatedSwipeable>
          );
        }}

      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sep: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
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
});
