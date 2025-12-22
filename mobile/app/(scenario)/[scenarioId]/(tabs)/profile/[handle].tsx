import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_PROFILES } from '@/mocks/profiles';
import { MOCK_FEEDS } from '@/mocks/feeds';
import { Post } from '@/components/Post';
import { useAuth } from '@/context/auth';


function formatJoined(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Joined March 2023';
  const month = d.toLocaleString(undefined, { month: 'long' });
  const year = d.getFullYear();
  return `Joined ${month} ${year}`;
}

export default function ProfileScreen() {
  const { scenarioId, handle } = useLocalSearchParams<{ scenarioId: string; handle: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { userId } = useAuth();

  const sid = decodeURIComponent(String(scenarioId ?? ''));
  const wanted = decodeURIComponent(String(handle ?? ''));
  const profile = useMemo(() => {
    return (
      MOCK_PROFILES.find(
        (p: any) => p.scenarioId === sid && String(p.handle) === String(wanted)
      ) ?? null
    );
  }, [sid, wanted]);

  const isMe = !!profile && profile.ownerUserId === userId;

  const [fakeHeaderVariant, setFakeHeaderVariant] = useState(0);

  const headerUri =
    fakeHeaderVariant % 3 === 0
      ? 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1200&q=60'
      : fakeHeaderVariant % 3 === 1
      ? 'https://images.unsplash.com/photo-1520975958225-5f5b3cb3b44b?auto=format&fit=crop&w=1200&q=60'
      : 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60';

  const all = MOCK_FEEDS[sid] ?? [];
  const myPosts = useMemo(() => {
    if (!profile) return [];
    return all
      .filter((p: any) => p.authorProfileId === profile.id)
      .filter((p: any) => !p.parentPostId)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  }, [all, profile]);

  const profileById = useMemo(() => {
    const list = MOCK_PROFILES.filter((p: any) => p.scenarioId === sid);
    return new Map(list.map((p: any) => [p.id, p]));
  }, [sid]);

  if (!profile) {
    const wantedAt = `@${wanted}`;
    return (
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, padding: 16, paddingTop: 18 }}>
          <ThemedText style={{ color: colors.textSecondary }}>
            Profile not found for {wantedAt} in scenario {sid}.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <FlatList
          data={myPosts}
          keyExtractor={(p: any) => p.id}
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
                  onPress={() => {
                    setFakeHeaderVariant((v) => v + 1);
                  }}
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
                      opacity: pressed ? 0.55 : 0.75,
                    },
                  ]}
                >
                <MaterialIcons name="keyboard-arrow-left" size={24} color="#fff" />
                </Pressable>
              </View>

              <View style={styles.avatarRow}>
                <View
                  style={[styles.avatarOuter, { backgroundColor: colors.background }]}
                >
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
                    onPress={() => Alert.alert('Not yet', 'Edit profile modal later.')}
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
                  {profile.handle}
                </ThemedText>

                {!!profile.bio && (
                  <ThemedText style={[styles.bio, { color: colors.text }]}> 
                    {profile.bio}
                  </ThemedText>
                )}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <ThemedText
                      style={[styles.metaText, { color: colors.textSecondary }]}
                    >
                      {sid === 'demo-royalty'
                        ? 'Canadia'
                        : sid === 'demo-mafia'
                        ? 'somewhere dangerous'
                        : 'campus'}
                    </ThemedText>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons
                      name="link-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <ThemedText style={[styles.metaText, { color: colors.tint }]}>
                      {profile.handle.replace('@', '')}.feedverse
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <ThemedText
                      style={[styles.metaText, { color: colors.textSecondary }]}
                    >
                      {formatJoined(profile.id)}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.followsRow}>
                  <ThemedText style={{ color: colors.text }}>
                    <ThemedText type="defaultSemiBold">128</ThemedText>{' '}
                    <ThemedText style={{ color: colors.textSecondary }}>
                      Following
                    </ThemedText>
                  </ThemedText>

                  <ThemedText style={{ color: colors.text }}>
                    <ThemedText type="defaultSemiBold">4,203</ThemedText>{' '}
                    <ThemedText style={{ color: colors.textSecondary }}>
                      Followers
                    </ThemedText>
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.tabsBar, { borderBottomColor: colors.border }]}>
                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
                >
                  <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                    Posts
                  </ThemedText>
                  <View
                    style={[styles.tabUnderline, { backgroundColor: colors.tint }]}
                  />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
                >
                  <ThemedText style={{ color: colors.textSecondary }}>
                    Replies
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
                >
                  <ThemedText style={{ color: colors.textSecondary }}>Media</ThemedText>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
                >
                  <ThemedText style={{ color: colors.textSecondary }}>Likes</ThemedText>
                </Pressable>
              </View>
            </View>
          )}
          renderItem={({ item }: any) => {
            const author = profileById.get(item.authorProfileId);
            if (!author) return null;

            return (
              <Pressable
                onPress={() =>
                  router.push(`/(scenario)/${sid}/(tabs)/post/${item.id}` as any)
                }
                style={({ pressed }) => [
                  { backgroundColor: pressed ? colors.pressed : colors.background },
                ]}
              >
                <Post profile={author} item={item} variant="feed" showActions />
              </Pressable>
            );
          }}
          ListEmptyComponent={() => (
            <View style={{ padding: 18 }}>
              <ThemedText style={{ color: colors.textSecondary }}>No posts yet.</ThemedText>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
        />
    </ThemedView>
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
  headerOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  headerOverlayText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.85,
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
});