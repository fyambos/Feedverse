import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  FlatList,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

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
  avatarOverrides,
}: {
  sid: string;
  item: any;
  colors: any;
  userId: string | null;
  getProfileById?: (scenarioId: string, id: string) => any;
  avatarOverrides?: Record<string, string>;
}) {
  const authorProfileRaw = getProfileById?.(sid, String(item.authorProfileId));
  if (!authorProfileRaw) return null;

  const override = avatarOverrides?.[String(item.authorProfileId)];
  const authorProfile = override
    ? { ...(authorProfileRaw as any), avatarUrl: override }
    : authorProfileRaw;
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
  const { getProfileById, getProfileByHandle, selectedProfileId } = useProfile();

  const sid = decodeURIComponent(String(scenarioId ?? ''));
  const wanted = decodeURIComponent(String(handle ?? ''));

  const AVATAR_KEY = `feedverse.profile.avatar.${sid}.${wanted}`;
  const HEADER_KEY = `feedverse.profile.header.${sid}.${wanted}`;

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [headerUri, setHeaderUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [a, h] = await Promise.all([
        AsyncStorage.getItem(AVATAR_KEY),
        AsyncStorage.getItem(HEADER_KEY),
      ]);
      setAvatarUri(a);
      setHeaderUri(h);
    })();
  }, [AVATAR_KEY, HEADER_KEY]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Enable photo access to pick images.');
      return null;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });

    if (res.canceled) return null;
    return res.assets?.[0]?.uri ?? null;
  }, []);




  const profile = useMemo(() => {
    const p = getProfileByHandle?.(sid, wanted);
    return p ?? null;
  }, [sid, wanted, getProfileByHandle]);
  const currentProfileId = selectedProfileId?.(sid);
  const isCurrentSelected = !!profile && String(currentProfileId) === String(profile.id);

  // editable if owned OR public
  const canEditProfile =
    !!profile && (profile.ownerUserId === userId || !!(profile as any).isPublic);

  // only when editable BUT not currently selected: enable the Follow<->Edit toggle
  const showToggleEdit = canEditProfile && !isCurrentSelected;

  const [showEditInstead, setShowEditInstead] = useState(false);
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>({});

  const loadAvatarOverrides = useCallback(async () => {
    if (!profile) return;
    try {
      const key = `feedverse.profile.avatar.${sid}.${profile.handle}`;
      const uri = await AsyncStorage.getItem(key);

      // map by authorProfileId (because posts use authorProfileId)
      setAvatarOverrides(uri ? { [String(profile.id)]: uri } : {});
    } catch {
      setAvatarOverrides({});
    }
  }, [sid, profile]);


  const isMe = !!profile && profile.ownerUserId === userId;

  // derived URIs: prefer persisted local picks, fall back to profile-provided URIs (if any)
  const avatarToShow = avatarUri ?? (profile as any)?.avatarUrl ?? undefined;
  const headerToShow = headerUri ?? (profile as any)?.headerUrl ?? undefined;

  const [persistedPosts, setPersistedPosts] = useState<any[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const withPickerLock = useCallback(async <T,>(fn: () => Promise<T>) => {
    if (picking) return null as any;
    setPicking(true);
    try {
      return await fn();
    } finally {
      setPicking(false);
    }
  }, [picking]);
    const onChangeAvatar = useCallback(async () => {
    const uri = await withPickerLock(() => pickImage());
    if (!uri) return;

    setAvatarUri(uri);
    await AsyncStorage.setItem(AVATAR_KEY, uri);
    setAvatarOverrides({ [String(profile?.id)]: uri });
  }, [withPickerLock, pickImage, AVATAR_KEY, profile]);

  const onChangeHeader = useCallback(async () => {
    const uri = await withPickerLock(() => pickImage());
    if (!uri) return;

    setHeaderUri(uri);
    await AsyncStorage.setItem(HEADER_KEY, uri);
  }, [withPickerLock, pickImage, HEADER_KEY]);
  const openViewer = useCallback((uri?: string) => {
    if (!uri) return;
    setViewerUri(uri);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerUri(null);
  }, []);

  const saveToDevice = useCallback(async (uri: string) => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow Photos permission to save images.');
        return;
      }

      // If it's a remote URL, download first
      let localUri = uri;
      if (/^https?:\/\//i.test(uri)) {
        const filename = `feedverse_${Date.now()}.jpg`;
        const dest = `${FileSystem.cacheDirectory}${filename}`;
        const dl = await FileSystem.downloadAsync(uri, dest);
        localUri = dl.uri;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Image saved to your Photos.');
    } catch (e) {
      Alert.alert('Could not save', 'Something went wrong while saving this image.');
    }
  }, []);
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
      void loadAvatarOverrides(); 
      return () => {};
    }, [loadPersistedPosts, loadAvatarOverrides])
  );

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
                    onPress={() => openViewer(headerToShow)}
                    onLongPress={() => {
                      if (isMe) onChangeHeader();
                    }}
                    delayLongPress={250}
                    style={StyleSheet.absoluteFill}
                  >
                    <Pressable
                      onPress={onChangeHeader}
                      hitSlop={12}
                      style={[styles.headerEditBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
                    >
                      <Ionicons name="camera" size={16} color="#fff" />
                    </Pressable>
                    {isMe ? (
                      <Pressable
                        onPress={onChangeHeader}
                        disabled={picking}
                        hitSlop={12}
                        style={({ pressed }) => [
                          styles.headerEditBadge,
                          { backgroundColor: 'rgba(0,0,0,0.55)' },
                          pressed && styles.pressedPop,
                          picking && { opacity: 0.6 },
                        ]}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                      </Pressable>
                    ) : null}
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
                      onPress={() => openViewer(avatarToShow)}
                      onLongPress={() => {
                        if (isMe) onChangeAvatar();
                      }}
                      delayLongPress={250}
                    >
                      <Image source={{ uri: avatarToShow }} style={styles.avatar} />
                      {isMe ? (
                        <Pressable
                          onPress={onChangeAvatar}
                          disabled={picking}
                          hitSlop={12}
                          style={({ pressed }) => [
                            styles.avatarEditBadge,
                            { backgroundColor: colors.card, borderColor: colors.border },
                            pressed && styles.pressedPop,
                            picking && { opacity: 0.6 },
                          ]}
                        >
                          <Ionicons name="camera" size={16} color={colors.text} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </View>

                  <View style={{ flex: 1 }} />

                  {isMe && isCurrentSelected ? (
                    <Pressable
                      onPress={() => {
                        router.push({
                          pathname: '/modal/create-profile',
                          params: { scenarioId: sid, mode: 'edit', profileId: profile.id },
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
                  ) : showToggleEdit ? (
                    // Editable but NOT currently selected: default Follow, long-press toggles
                    showEditInstead ? (
                      <Pressable
                        onPress={() => {
                          router.push({
                            pathname: '/modal/create-profile',
                            params: { scenarioId: sid, mode: 'edit', profileId: profile.id },
                          } as any);
                        }}
                        onLongPress={() => setShowEditInstead(false)}
                        delayLongPress={250}
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
                        onLongPress={() => setShowEditInstead(true)}
                        delayLongPress={250}
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
                    )
                  ) : (
                    // Not editable: normal Follow.
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
              avatarOverrides={avatarOverrides}
            />
            )}
            ListEmptyComponent={() => (
              <View style={{ padding: 18 }}>
                <ThemedText style={{ color: colors.textSecondary }}>No posts yet.</ThemedText>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
          />
          {picking && (
            <View style={styles.pickerOverlay} pointerEvents="auto">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {viewerOpen && (
            <Modal visible transparent animationType="fade" onRequestClose={closeViewer}>
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0,0,0,0.92)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 16,
                }}
                onPress={closeViewer}
              >
                <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520 }}>
                  {viewerUri ? (
                    <Pressable
                      onLongPress={() => saveToDevice(viewerUri)}
                      delayLongPress={250}
                      style={{ width: '100%' }}
                    >
                      <Image
                        source={{ uri: viewerUri }}
                        style={{
                          width: '100%',
                          height: 420,
                          borderRadius: 14,
                          resizeMode: 'contain',
                        }}
                      />
                    </Pressable>
                  ) : null}

                  <View
                    style={{
                      marginTop: 14,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Pressable onPress={closeViewer} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                      <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Close</ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => viewerUri && saveToDevice(viewerUri)}
                      hitSlop={10}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                      <ThemedText style={{ color: '#fff', fontWeight: '900' }}>Save</ThemedText>
                    </Pressable>
                  </View>

                </Pressable>
              </Pressable>
            </Modal>
          )}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    zIndex: 20,
    elevation: 20,
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


  headerEditBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
    pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },

  pressedPop: {
    transform: [{ scale: 0.92 }],
  },

  
});