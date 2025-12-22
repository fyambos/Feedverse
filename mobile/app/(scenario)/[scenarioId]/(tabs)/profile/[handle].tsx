import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { Post } from '@/components/Post';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useFocusEffect } from '@react-navigation/native';


function formatJoined(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Joined';
  const month = d.toLocaleString(undefined, { month: 'long' });
  const year = d.getFullYear();
  return `Joined ${month} ${year}`;
}

function formatCount(n: number) {
  const v = Math.max(0, Math.floor((n as any) || 0));

  // cap display only above 99B
  if (v > 99_000_000_000) return '99B+';

  if (v < 1000) return String(v);

  // thousands
  if (v < 100_000) {
    // 1K .. 99.9K
    const k = v / 1000;
    const str = k.toFixed(1).replace(/\.0$/, '');
    return `${str}K`;
  }

  if (v < 1_000_000) {
    // 100K .. 999K
    return `${Math.floor(v / 1000)}K`;
  }

  // millions
  if (v < 10_000_000) {
    // 1M .. 9.9M
    const m = v / 1_000_000;
    const str = m.toFixed(1).replace(/\.0$/, '');
    return `${str}M`;
  }

  if (v < 1_000_000_000) {
    // 10M .. 999M
    return `${Math.floor(v / 1_000_000)}M`;
  }

  // billions
  if (v < 10_000_000_000) {
    // 1B .. 9.9B
    const b = v / 1_000_000_000;
    const str = b.toFixed(1).replace(/\.0$/, '');
    return `${str}B`;
  }

  // 10B .. 99B
  return `${Math.floor(v / 1_000_000_000)}B`;
}

function SwipeActions({
  dragX,
  colors,
  onEdit,
  onDelete,
}: {
  dragX: any;
  colors: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ACTIONS_WIDTH = 120; 

  const animStyle = useAnimatedStyle(() => {
    const tx = interpolate(dragX.value, [-ACTIONS_WIDTH, 0], [0, ACTIONS_WIDTH]);
    return { transform: [{ translateX: tx }] };
  });

  const pressedBg = colors.pressed;

  return (
    <Animated.View
      style={[
        styles.swipeActions,
        {
          width: ACTIONS_WIDTH,
        },
        animStyle,
      ]}
    >
      <Pressable
        onPress={onEdit}
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
        onPress={onDelete}
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
}

function SwipeablePostRow({
  sid,
  item,
  colors,
  userId,
  getProfileById,
}: {
  sid: string;
  item: any;
  colors: any;
  userId: string | null;
  getProfileById?: (scenarioId: string, id: string) => any;
}) {
  const authorProfile = getProfileById?.(sid, String(item.authorProfileId));
  if (!authorProfile) return null;

  const isOwner = authorProfile.ownerUserId === userId;
  const isPublic = !!(authorProfile as any)?.isPublic;
  const canEdit = isOwner || isPublic;

  const swipeRef = React.useRef<SwipeableMethods | null>(null);

  const Row = (
    <Pressable
      onPress={() =>
        router.push(`/(scenario)/${sid}/(tabs)/post/${String(item.id)}` as any)
      }
      style={({ pressed }) => [
        { backgroundColor: pressed ? colors.pressed : colors.background },
      ]}
    >
      <Post scenarioId={sid} profile={authorProfile} item={item} variant="feed" showActions />
    </Pressable>
  );

  if (!canEdit) return Row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, dragX) => (
        <SwipeActions
          dragX={dragX}
          colors={colors}
          onEdit={() => {
            swipeRef.current?.close();
            router.push({
              pathname: '/modal/create-post',
              params: { scenarioId: sid, mode: 'edit', postId: String(item.id) },
            } as any);
          }}
          onDelete={() => {
            swipeRef.current?.close();
            Alert.alert('Delete post?', 'This will remove the post.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  Alert.alert(
                    'Not wired',
                    'Hook this to your delete function from index.'
                  );
                },
              },
            ]);
          }}
        />
      )}
    >
      {Row}
    </ReanimatedSwipeable>
  );
}

export default function ProfileScreen() {
  const { scenarioId, handle } = useLocalSearchParams<{ scenarioId: string; handle: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { userId } = useAuth();
  const { getProfileById, getProfileByHandle } = useProfile();

  const sid = decodeURIComponent(String(scenarioId ?? ''));
  const wanted = decodeURIComponent(String(handle ?? ''));

  // ✅ IMPORTANT: use ProfileContext (mocks + persisted edits)
  const profile = useMemo(() => {
    const p = getProfileByHandle?.(sid, wanted);
    return p ?? null;
  }, [sid, wanted, getProfileByHandle]);

  const isMe = !!profile && profile.ownerUserId === userId;

  const [fakeHeaderVariant, setFakeHeaderVariant] = useState(0);
  const [persistedPosts, setPersistedPosts] = useState<any[]>([]);

  const loadPersistedPosts = useCallback(async () => {
    try {
      const candidates: any[] = [];

      // 1) Per-scenario key: feedverse.posts.<scenarioId>
      const rawScenario = await AsyncStorage.getItem(`feedverse.posts.${sid}`);
      if (rawScenario) {
        try {
          const parsed = JSON.parse(rawScenario);
          if (Array.isArray(parsed)) candidates.push(...parsed);
        } catch {}
      }

      // 2) Map key: feedverse.posts.byScenario => { [sid]: Post[] }
      const rawMap = await AsyncStorage.getItem('feedverse.posts.byScenario');
      if (rawMap) {
        try {
          const parsed = JSON.parse(rawMap);
          const arr = parsed?.[sid];
          if (Array.isArray(arr)) candidates.push(...arr);
        } catch {}
      }

      // 3) Legacy-ish key: feedverse.feed.postsByScenario => { [sid]: Post[] }
      const rawLegacy = await AsyncStorage.getItem('feedverse.feed.postsByScenario');
      if (rawLegacy) {
        try {
          const parsed = JSON.parse(rawLegacy);
          const arr = parsed?.[sid];
          if (Array.isArray(arr)) candidates.push(...arr);
        } catch {}
      }

      const byId = new Map<string, any>();
      for (const p of candidates) {
        if (p && p.id) byId.set(String(p.id), p);
      }

      setPersistedPosts(Array.from(byId.values()));
    } catch {
      setPersistedPosts([]);
    }
  }, [sid]);

  // initial load
  useEffect(() => {
    void loadPersistedPosts();
  }, [loadPersistedPosts]);

  // IMPORTANT: refresh when coming back from edit/create post modal
  useFocusEffect(
    useCallback(() => {
      void loadPersistedPosts();
      return () => {};
    }, [loadPersistedPosts])
  );

  const headerUri =
    fakeHeaderVariant % 3 === 0
      ? 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1200&q=60'
      : fakeHeaderVariant % 3 === 1
      ? 'https://images.unsplash.com/photo-1520975958225-5f5b3cb3b44b?auto=format&fit=crop&w=1200&q=60'
      : 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60';

  const all = useMemo(() => {
    const mock = MOCK_FEEDS[sid] ?? [];
    const combined = [...mock, ...persistedPosts];

    // de-dupe by id (persisted should win if same id)
    const byId = new Map<string, any>();
    for (const p of combined) {
      if (!p || !p.id) continue;
      byId.set(String(p.id), p);
    }

    return Array.from(byId.values());
  }, [sid, persistedPosts]);

  const myPosts = useMemo(() => {
    if (!profile) return [];
    return all
      .filter((p: any) => String(p.authorProfileId) === String(profile.id))
      .filter((p: any) => !p.parentPostId)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  }, [all, profile]);

  if (!profile) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1 }}>
          <View style={{ padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              Profile not found for {wanted} in scenario {sid}.
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1 }}>
          <FlatList
            data={myPosts}
            extraData={persistedPosts}
            keyExtractor={(p: any) => String(p.id)}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.border,
                  opacity: 0.9,
                }}
              />
            )}
            ListHeaderComponent={() => (
              <View>
                <View style={styles.headerMediaWrap}>
                  <Pressable
                    onPress={() => setFakeHeaderVariant((v) => v + 1)}
                    style={StyleSheet.absoluteFill}
                  >
                    <Image source={{ uri: headerUri }} style={styles.headerMedia} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.back()}
                    hitSlop={12}
                    style={({ pressed }) => [
                      styles.backBtn,
                      {
                        opacity: pressed ? 0.5 : 0.6,
                      },
                    ]}
                  >
                    <MaterialIcons name="keyboard-arrow-left" size={24} color="#fff" />
                  </Pressable>
                </View>

                <View style={styles.avatarRow}>
                  <View style={[styles.avatarOuter, { backgroundColor: colors.background }]}>
                    <Pressable
                      onPress={() => {
                        Alert.alert('Not yet', 'Avatar picker will be implemented later.');
                      }}
                      disabled={!isMe}
                    >
                      <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                      {isMe ? (
                        <View
                          style={[
                            styles.avatarEditBadge,
                            { backgroundColor: colors.card, borderColor: colors.border },
                          ]}
                        >
                          <Ionicons name="camera" size={16} color={colors.text} />
                        </View>
                      ) : null}
                    </Pressable>
                  </View>

                  <View style={{ flex: 1 }} />

                  {isMe ? (
                    <Pressable
                      onPress={() => {
                        router.push({
                          pathname: '/modal/create-profile',
                          params: {
                            scenarioId: sid,
                            mode: 'edit',
                            profileId: profile.id,
                          },
                        } as any);
                      }}
                      style={({ pressed }) => [
                        styles.ghostBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.pressed : colors.background,
                        },
                      ]}
                    >
                      <ThemedText style={{ fontWeight: '700', color: colors.text }}>
                        Edit profile
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => Alert.alert('Not yet', 'Follow logic later.')}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        {
                          backgroundColor: colors.text,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <ThemedText style={{ fontWeight: '800', color: colors.background }}>
                        Follow
                      </ThemedText>
                    </Pressable>
                  )}
                </View>

                <View style={styles.bioBlock}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.displayName, { color: colors.text }]}
                  >
                    {profile.displayName}
                  </ThemedText>
                  <ThemedText style={[styles.handle, { color: colors.textSecondary }]}>
                    @{profile.handle}
                  </ThemedText>

                  {!!profile.bio && (
                    <ThemedText style={[styles.bio, { color: colors.text }]}>
                      {profile.bio}
                    </ThemedText>
                  )}

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                      <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                        {profile.location ?? ''}
                      </ThemedText>
                    </View>

                    <View style={styles.metaItem}>
                      <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
                      <ThemedText style={[styles.metaText, { color: colors.tint }]}>
                        {profile.link ? (
                          <ThemedText style={[styles.metaText, { color: colors.tint }]}>
                            {profile.link.replace(/^https?:\/\//, '')}
                          </ThemedText>
                        ) : (
                          <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                            —
                          </ThemedText>
                        )}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                        {profile.joinedDate ? formatJoined(profile.joinedDate) : 'Joined'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.followsRow}>
                    <ThemedText style={{ color: colors.text }}>
                      <ThemedText type="defaultSemiBold">
                        {formatCount(profile.followingCount ?? 0)}
                      </ThemedText>{' '}
                      <ThemedText style={{ color: colors.textSecondary }}>Following</ThemedText>
                    </ThemedText>

                    <ThemedText style={{ color: colors.text }}>
                      <ThemedText type="defaultSemiBold">
                        {formatCount(profile.followersCount ?? 0)}
                      </ThemedText>{' '}
                      <ThemedText style={{ color: colors.textSecondary }}>Followers</ThemedText>
                    </ThemedText>
                  </View>
                </View>

                <View style={[styles.tabsBar, { borderBottomColor: colors.border }]}>
                  <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                    <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                      Posts
                    </ThemedText>
                    <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
                  </Pressable>

                  <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                    <ThemedText style={{ color: colors.textSecondary }}>Replies</ThemedText>
                  </Pressable>

                  <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                    <ThemedText style={{ color: colors.textSecondary }}>Media</ThemedText>
                  </Pressable>

                  <Pressable style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
                    <ThemedText style={{ color: colors.textSecondary }}>Likes</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
            renderItem={({ item }: any) => (
              <SwipeablePostRow
                sid={sid}
                item={item}
                colors={colors}
                userId={userId}
                getProfileById={getProfileById}
              />
            )}
            ListEmptyComponent={() => (
              <View style={{ padding: 18 }}>
                <ThemedText style={{ color: colors.textSecondary }}>No posts yet.</ThemedText>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
          />
        </View>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  headerMediaWrap: {
    height: 140,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#111',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    top: '50%',
    left: 6,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.62)',
    transform: [{ translateY: -17 }],
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerMedia: {
    width: '100%',
    height: '100%',
  },

  avatarRow: {
    marginTop: -26,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 999,
    padding: 4,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 999,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  ghostBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bioBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  handle: {
    fontSize: 14,
    marginTop: -2,
  },
  bio: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 6,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 6,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },

  followsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },

  tabsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  tabUnderline: {
    height: 4,
    width: 48,
    borderRadius: 999,
    marginTop: 6,
  },
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