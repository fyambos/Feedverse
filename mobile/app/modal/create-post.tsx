import React, { useEffect, useMemo, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  StyleSheet,
  TextInput,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfile } from '@/context/profile';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { MOCK_FEEDS } from '@/mocks/feeds';

function clampInt(n: number, min = 0, max = 99000000) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function formatCount(n: number) {
  const v = Math.max(0, Math.floor(n || 0));

  // cap display only above 99M
  if (v > 99000000) return '99M+';

  if (v < 1000) return String(v);

  // thousands
  if (v < 100000) {
    // 1K .. 99.9K
    const k = v / 1000;
    const str = k.toFixed(1).replace(/\.0$/, '');
    return `${str}K`;
  }

  if (v < 1000000) {
    // 100K .. 999K
    return `${Math.floor(v / 1000)}K`;
  }

  // millions
  if (v < 10000000) {
    // 1M .. 9.9M
    const m = v / 1000000;
    const str = m.toFixed(1).replace(/\.0$/, '');
    return `${str}M`;
  }

  // 10M .. 99M
  return `${Math.floor(v / 1000000)}M`;
}

function RowCard({
  label,
  children,
  right,
  colors,
}: {
  label: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
        {children}
      </View>
      {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
    </View>
  );
}

type StoredPost = {
  id: string;
  scenarioId: string;
  authorProfileId: string;
  text: string;
  createdAt: string;
  imageUrl?: string | null;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  parentPostId?: string;
  isEdited?: boolean;
};

function postsKey(scenarioId: string) {
  return `feedverse.posts.${scenarioId}`;
}

async function appendPost(scenarioId: string, post: StoredPost) {
  const key = postsKey(scenarioId);
  const raw = await AsyncStorage.getItem(key);
  let list: StoredPost[] = [];
  if (raw) {
    try {
      list = JSON.parse(raw) as StoredPost[];
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }
  // newest first
  const next = [post, ...list];
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readStoredPosts(scenarioId: string) {
  const key = postsKey(scenarioId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [] as StoredPost[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredPost[]) : ([] as StoredPost[]);
  } catch {
    return [] as StoredPost[];
  }
}

async function writeStoredPosts(scenarioId: string, posts: StoredPost[]) {
  const key = postsKey(scenarioId);
  await AsyncStorage.setItem(key, JSON.stringify(posts));
}

async function findPostById(scenarioId: string, postId: string): Promise<StoredPost | null> {
  // Prefer stored (it may contain edits), then fallback to mocks.
  const stored = await readStoredPosts(scenarioId);
  const inStored = stored.find((p) => p.id === postId);
  if (inStored) return inStored;

  const mock = (MOCK_FEEDS[scenarioId] ?? []).find((p: any) => p.id === postId);
  if (!mock) return null;

  return {
    id: mock.id,
    scenarioId: String(mock.scenarioId ?? scenarioId),
    authorProfileId: String(mock.authorProfileId),
    text: String(mock.text ?? ''),
    createdAt: String(mock.createdAt),
    imageUrl: mock.imageUrl ?? null,
    replyCount: mock.replyCount ?? 0,
    repostCount: mock.repostCount ?? 0,
    likeCount: mock.likeCount ?? 0,
    parentPostId: mock.parentPostId ?? undefined,
  };
}

async function upsertPost(scenarioId: string, post: StoredPost) {
  const stored = await readStoredPosts(scenarioId);
  // remove any existing with same id, then put newest first.
  const next = [post, ...stored.filter((p) => p.id !== post.id)];
  await writeStoredPosts(scenarioId, next);
}

export default function CreatePostModal() {
  const { scenarioId, postId, parentPostId, replyingTo } = useLocalSearchParams<{
    scenarioId: string;
    postId?: string;
    parentPostId?: string;
    replyingTo?: string;
  }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const { selectedProfileId, getProfileById } = useProfile();
  const sid = String(scenarioId ?? '');
  const editingPostId = postId ? String(postId) : '';
  const isEdit = !!editingPostId;

  const selectedId = selectedProfileId(sid);
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(selectedId);
  const [pickAuthorArmed, setPickAuthorArmed] = useState(false);
  const [parentId, setParentId] = useState<string | undefined>(undefined);

  const profile = useMemo(() => {
    if (!authorProfileId) return null;
    return getProfileById(sid, authorProfileId);
  }, [sid, authorProfileId, getProfileById]);

  const [text, setText] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [replyCount, setReplyCount] = useState('');
  const [repostCount, setRepostCount] = useState('');
  const [likeCount, setLikeCount] = useState('');

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const replyParentId = parentPostId ? String(parentPostId) : undefined;

    if (!isEdit) {
      // create mode: ensure author uses current selection
      setAuthorProfileId((prev) => prev ?? selectedId ?? null);
      setParentId(replyParentId);
      setAuthorProfileId((prev) => prev ?? selectedId ?? null);
      return;
    }
    if (hydrated) return;

    (async () => {
      const found = await findPostById(sid, editingPostId);
      if (!found) {
        // If post can't be found, just close to avoid a broken modal.
        router.back();
        return;
      }
      const replyingToHandle = replyingTo ? String(replyingTo) : undefined;

      setAuthorProfileId(found.authorProfileId);
      setText(found.text ?? '');
      setDate(new Date(found.createdAt));
      setReplyCount(String(found.replyCount ?? 0));
      setRepostCount(String(found.repostCount ?? 0));
      setLikeCount(String(found.likeCount ?? 0));
      setHydrated(true);
      setParentId(found.parentPostId ? String(found.parentPostId) : replyParentId);
    })();
  }, [isEdit, hydrated, sid, editingPostId, selectedId, parentPostId]);

  useEffect(() => {
    if (!pickAuthorArmed) return;
    if (!selectedId) return;

    setAuthorProfileId(selectedId);
    setPickAuthorArmed(false);
  }, [pickAuthorArmed, selectedId]);

  const canPost = text.trim().length > 0 && !!authorProfileId;

  const counts = useMemo(() => {
    const r1 = clampInt(Number(replyCount || 0), 0, 99000000);
    const r2 = clampInt(Number(repostCount || 0), 0, 99000000);
    const r3 = clampInt(Number(likeCount || 0), 0, 99000000);
    return { reply: r1, repost: r2, like: r3 };
  }, [replyCount, repostCount, likeCount]);

  const onPost = async () => {
    if (!canPost) return;
    if (!authorProfileId) {
      router.back();
      return;
    }

    const base: StoredPost = {
      id: isEdit ? editingPostId : makeId('po'),
      scenarioId: sid,
      authorProfileId,
      text: text.trim(),
      createdAt: date.toISOString(),
      imageUrl: null,
      replyCount: counts.reply,
      repostCount: counts.repost,
      likeCount: counts.like,
      isEdited: isEdit ? true : undefined,
      parentPostId: parentId,
    };

    if (isEdit) {
      await upsertPost(sid, base);
    } else {
      await appendPost(sid, base);
    }

    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          {/* HEADER */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <ThemedText style={{ color: colors.text, fontSize: 16 }}>Cancel</ThemedText>
            </Pressable>

            <Pressable
              onPress={onPost}
              disabled={!canPost}
              hitSlop={10}
              style={({ pressed }) => [
                styles.postBtn,
                {
                  backgroundColor: colors.tint,
                  opacity: !canPost ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                {isEdit ? 'Save' : 'Post'}
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            
          >
            
            {/* COMPOSER */}
            <View style={styles.composer}>
              <Pressable
                onPress={() => {
                  setPickAuthorArmed(true);
                  router.push(
                    {
                      pathname: '/modal/select-profile',
                      params: { scenarioId: sid },
                    } as any
                  );
                }}
                hitSlop={10}
                style={({ pressed }) => [pressed && { opacity: 0.75 }]}
              >
                {profile ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.border }]} />
                )}
              </Pressable>

              <View style={{ flex: 1 }}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setText(v.slice(0, 500))}
                  placeholder="What’s happening?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.input, { color: colors.text }]}
                  selectionColor={colors.tint}
                  maxLength={500}
                  scrollEnabled
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                {text.length}/500
              </ThemedText>
            </View>

            <View style={[styles.softDivider, { backgroundColor: colors.border }]} />

            {/* TOOLBAR */}
            <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
              <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="camera-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="image-outline" size={22} color={colors.tint} />
              </Pressable>

              <Pressable hitSlop={10} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}>
                <MaterialIcons name="gif" size={22} color={colors.tint} />
              </Pressable>
            </View>

            {/* META CONTROLS */}
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Post settings</ThemedText>

              <RowCard label="Date" colors={colors}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pressable
                    onPress={() => {
                      setPickerMode('date');
                      setShowDatePicker(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>
                      {date.toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setPickerMode('time');
                      setShowDatePicker(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>
                      {date.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </ThemedText>
                  </Pressable>
                </View>
              </RowCard>

              <View style={styles.rowGrid}>
                <View style={{ flex: 1 }}>
                  <RowCard
                    label="Replies"
                    colors={colors}
                    right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.reply)}</ThemedText>}
                  >
                    <TextInput
                      value={replyCount}
                      onChangeText={setReplyCount}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      style={[styles.rowInput, { color: colors.text }]}
                      selectionColor={colors.tint}
                    />
                  </RowCard>
                </View>

                <View style={{ flex: 1 }}>
                  <RowCard
                    label="Reposts"
                    colors={colors}
                    right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.repost)}</ThemedText>}
                  >
                    <TextInput
                      value={repostCount}
                      onChangeText={setRepostCount}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      style={[styles.rowInput, { color: colors.text }]}
                      selectionColor={colors.tint}
                    />
                  </RowCard>
                </View>
              </View>

              <RowCard
                label="Likes"
                colors={colors}
                right={<ThemedText style={{ color: colors.textSecondary }}>{formatCount(counts.like)}</ThemedText>}
              >
                <TextInput
                  value={likeCount}
                  onChangeText={setLikeCount}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={[styles.rowInput, { color: colors.text }]}
                  selectionColor={colors.tint}
                />
              </RowCard>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode={pickerMode}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_: any, selected: Date | undefined) => {
                  setShowDatePicker(false);
                  if (selected) setDate(selected);
                }}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 72,
    alignItems: 'center',
  },

  composer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
  },

  input: {
    fontSize: 19,
    lineHeight: 24,
    paddingTop: 2,
    paddingBottom: 6,
    minHeight: 120,
    maxHeight: 260,
  },

  softDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.9,
  },

  section: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  rowGrid: {
    flexDirection: 'row',
    gap: 10,
  },

  rowCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rowLabel: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '700',
  },

  rowInput: {
    fontSize: 16,
    paddingVertical: 0,
  },

  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
});