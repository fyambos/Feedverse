import React from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SimpleLineIcons from '@expo/vector-icons/SimpleLineIcons';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { storageFetchPostById, storageFetchProfileById } from '@/context/post';

type PostProfile = {
  displayName: string;
  handle: string;
  avatarUrl: string;
};

type PostItem = {
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
  quotedPostId?: string;
};

type QuotePayload = {
  profile: PostProfile;
  item: PostItem;
};

function formatRelativeTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();

  if (!Number.isFinite(diff) || diff < 0) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const abs = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${abs} · ${hh}:${mm}`;
  }

  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;

  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;

  const days = Math.floor(h / 24);
  if (days <= 7) return `${days}d`;

  const now = new Date();
  const sameYear = now.getFullYear() === d.getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} · ${hh}:${mm}`;
}

function formatDetailTimestamp(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  return `${hh}:${mm} ${dd}/${mo}/${yy}`;
}

function formatCount(n: number) {
  if (!Number.isFinite(n)) return '0';
  const num = Math.max(0, Math.floor(n));

  if (num >= 100_000_000) return String(num);

  if (num >= 1_000_000) {
    const v = num / 1_000_000;
    const s = v < 10 ? v.toFixed(1) : Math.floor(v).toString();
    return `${s.replace(/\.0$/, '')}M`;
  }

  if (num >= 1_000) {
    const v = num / 1_000;
    const s = v < 10 ? v.toFixed(1) : Math.floor(v).toString();
    return `${s.replace(/\.0$/, '')}K`;
  }

  return String(num);
}

function pluralize(n: number, singular: string, plural?: string) {
  const p = plural ?? `${singular}s`;
  return n === 1 ? singular : p;
}

// quote hydration, for now just storage
async function fetchPostById(_scenarioId: string, _postId: string): Promise<PostItem | null> {
  const p = await storageFetchPostById(_scenarioId, _postId);
  return (p as unknown as PostItem) ?? null;
}

async function fetchProfileById(_scenarioId: string, _profileId: string): Promise<PostProfile | null> {
  const prof = await storageFetchProfileById(_scenarioId, _profileId);
  if (!prof) return null;

  return {
    displayName: prof.displayName,
    handle: prof.handle,
    avatarUrl: prof.avatarUrl,
  };
}

export function Post({
  scenarioId,
  profile,
  item,
  variant = 'feed',
  replyingTo,
  showActions = true,
}: {
  scenarioId?: string;
  profile: PostProfile;
  item: PostItem;
  variant?: 'feed' | 'detail' | 'reply';
  replyingTo?: string;
  showActions?: boolean;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const isDetail = variant === 'detail';
  const isReply = variant === 'reply';

  const { scenarioId: scenarioIdParam } = useLocalSearchParams<{ scenarioId: string }>();
  const sid = String(scenarioId ?? item.scenarioId ?? scenarioIdParam ?? '');
  const handleSlug = profile.handle;

  const openProfile = () => {
    if (!sid || !handleSlug) return;

    const path = `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(handleSlug)}`;
    router.push(path as any);
  };

  const replyingToHandle = replyingTo ? replyingTo : '';

  const replyCount = item.replyCount ?? 0;
  const repostCount = item.repostCount ?? 0;
  const likeCount = item.likeCount ?? 0;

  const hasDetailCounts = isDetail && (repostCount > 0 || likeCount > 0);

  // show counts in feed/reply, hide in detail
  const showActionCounts = !isDetail;

  const onReply = () => {
    if (!sid) return;
    router.push(
      {
        pathname: '/modal/create-post',
        params: {
          scenarioId: sid,
          parentPostId: String(item.id),
        },
      } as any
    );
  };

  const onQuote = () => {
    if (!sid) return;
    router.push(
      {
        pathname: '/modal/create-post',
        params: {
          scenarioId: sid,
          quotedPostId: String(item.id),
        },
      } as any
    );
  };

  const replyScale = React.useRef(new Animated.Value(1)).current;
  const repostScale = React.useRef(new Animated.Value(1)).current;

  const pop = (v: Animated.Value) => {
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
  };

  const [hydratedQuote, setHydratedQuote] = React.useState<QuotePayload | null>(null);
  const [quoteMissing, setQuoteMissing] = React.useState(false);
  
  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      // no quote on this post
      if (!sid || !item.quotedPostId) {
        if (alive) {
          setHydratedQuote(null);
          setQuoteMissing(false);
        }
        return;
      }

      // reset per new quoted id
      setHydratedQuote(null);
      setQuoteMissing(false);

      const qPost = await fetchPostById(sid, item.quotedPostId);
      if (!alive) return;

      if (!qPost) {
        setQuoteMissing(true); 
        return;
      }

      const authorId = qPost.authorProfileId;
      if (!authorId) {
        setQuoteMissing(true);
        return;
      }

      const qProfile = await fetchProfileById(sid, authorId);
      if (!alive) return;

      if (!qProfile) {
        setQuoteMissing(true);
        return;
      }

      setHydratedQuote({ profile: qProfile, item: qPost });
    };

    run();

    return () => {
      alive = false;
    };
  }, [sid, item.quotedPostId]);
  const renderQuoted = () => {
    // no quotedPostId => no embed
    if (!item.quotedPostId) return null;

    // shared style (same padding/border as real quote)
    const containerStyle = [
      styles.quoteCard,
      { borderColor: colors.border, backgroundColor: colors.background },
    ];

    if (!hydratedQuote && quoteMissing) {
      return (
        <View style={containerStyle}>
          <View style={styles.quoteInner}>
            <View style={[styles.quoteAvatar, { backgroundColor: colors.border }]} />

            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '800', color: colors.text }}>
                Post unavailable
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
                This post has been deleted.
              </ThemedText>
            </View>
          </View>
        </View>
      );
    }

    // still loading / not hydrated yet
    if (!hydratedQuote) return null;

    const qProfile = hydratedQuote.profile;
    const qItem = hydratedQuote.item;

    return (
      <Pressable
        onPress={() => {
          if (!sid) return;
          router.push(`/(scenario)/${sid}/(tabs)/post/${String(qItem.id)}` as any);
        }}
        style={({ pressed }) => [containerStyle, pressed && { backgroundColor: colors.pressed }]}
      >
        <View style={styles.quoteInner}>
          <Image source={{ uri: qProfile.avatarUrl }} style={styles.quoteAvatar} />

          <View style={{ flex: 1 }}>
            <View style={styles.quoteTopRow}>
              <ThemedText
                numberOfLines={1}
                style={{ fontWeight: '800', color: colors.text, maxWidth: '70%' }}
              >
                {qProfile.displayName}
              </ThemedText>

              <ThemedText
                numberOfLines={1}
                style={{ color: colors.textSecondary, marginLeft: 8, flexShrink: 1 }}
              >
                @{qProfile.handle}
              </ThemedText>

              {!isDetail && (
                <>
                  <ThemedText style={{ color: colors.textSecondary }}> · </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary }}>
                    {formatRelativeTime(qItem.createdAt)}
                  </ThemedText>
                </>
              )}
            </View>

            <ThemedText numberOfLines={3} style={{ color: colors.text, marginTop: 6, lineHeight: 18 }}>
              {qItem.text}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  // ===== DETAIL VIEW LAYOUT =====
  if (isDetail) {
    return (
      <View style={styles.wrap}>
        {/* Header row (avatar + name/handle) */}
        <View style={styles.detailHeaderRow}>
          <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
            <Image source={{ uri: profile.avatarUrl }} style={[styles.avatar, styles.avatarDetail]} />
          </Pressable>

          <View style={styles.detailHeaderText}>
            <View style={styles.detailNameRow}>
              <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText type="defaultSemiBold" style={[styles.name, styles.nameDetail]} numberOfLines={1}>
                  {profile.displayName}
                </ThemedText>
              </Pressable>

              <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{profile.handle}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Text (FULL LEFT) */}
        <ThemedText style={[styles.text, styles.textDetail]}>{item.text}</ThemedText>

        {/* QRT (indented allowed) */}
        {renderQuoted()}

        {/* Media (indented allowed) */}
        {!!item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={[
              styles.media,
              styles.mediaDetail,
              { backgroundColor: scheme === 'dark' ? '#111' : '#eaeaea' },
            ]}
            resizeMode="cover"
          />
        )}

        {/* Timestamp (FULL LEFT) */}
        <ThemedText style={[styles.dateLine, { color: colors.textSecondary }]}>
          {formatDetailTimestamp(item.createdAt)}
        </ThemedText>

        {/* Counts (FULL LEFT) */}
        {hasDetailCounts && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.countsRow}>
              {repostCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(repostCount)}</ThemedText>{' '}
                  {pluralize(repostCount, 'Repost')}
                </ThemedText>
              )}
              {likeCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(likeCount)}</ThemedText>{' '}
                  {pluralize(likeCount, 'Like')}
                </ThemedText>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {/* Actions (FULL LEFT) */}
        {showActions && (
          <View style={[styles.actions, styles.actionsDetail]}>
            <View style={styles.actionSlot}>
              <View style={styles.action}>
                <Pressable
                  onPress={() => {
                    pop(replyScale);
                    onReply();
                  }}
                  hitSlop={6}
                  pressRetentionOffset={6}
                  style={styles.iconPressable}
                >
                  <Animated.View style={{ transform: [{ scale: replyScale }] }}>
                    <SimpleLineIcons name="bubble" size={20} color={colors.icon} />
                  </Animated.View>
                </Pressable>
                <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
              </View>
            </View>

            <View style={styles.actionSlot}>
              <View style={styles.action}>
                <Pressable
                  onPress={() => pop(repostScale)}
                  onLongPress={() => {
                    pop(repostScale);
                    onQuote();
                  }}
                  delayLongPress={250}
                  hitSlop={6}
                  pressRetentionOffset={6}
                  style={styles.iconPressable}
                >
                  <Animated.View style={{ transform: [{ scale: repostScale }] }}>
                    <IconSymbol name="arrow.2.squarepath" size={23} color={colors.icon} />
                  </Animated.View>
                </Pressable>
                <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
              </View>
            </View>

            <View style={styles.actionSlot}>
              <View style={styles.action}>
                <Ionicons name="heart-outline" size={22} color={colors.icon} />
                <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
              </View>
            </View>

            <View style={styles.actionSlot}>
              <View style={styles.action}>
                <Ionicons name="share-outline" size={22} color={colors.icon} />
                <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  const rightColStyle = [styles.rightCol, isReply && styles.rightColReply];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {/* LEFT: avatar */}
        <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        </Pressable>

        {/* RIGHT */}
        <View style={rightColStyle}>
          {/* HEADER */}
          <View style={styles.headerInline}>
            <View style={styles.headerTopRow}>
              <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
                  {profile.displayName}
                </ThemedText>
              </Pressable>

              <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
                <ThemedText style={[styles.handleInline, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{profile.handle} · {formatRelativeTime(item.createdAt)}
                </ThemedText>
              </Pressable>
            </View>

            {isReply && !!replyingToHandle && (
              <View style={styles.replyingInline}>
                <ThemedText style={[styles.replyingText, { color: colors.textSecondary }]}>
                  replying to <ThemedText type="link">@{replyingToHandle}</ThemedText>
                </ThemedText>
              </View>
            )}
          </View>

          {/* CONTENT */}
          <ThemedText style={[styles.text, isReply && styles.textReply]}>{item.text}</ThemedText>

          {renderQuoted()}

          {!!item.imageUrl && (
            <Image
              source={{ uri: item.imageUrl }}
              style={[styles.media, { backgroundColor: scheme === 'dark' ? '#111' : '#eaeaea' }]}
              resizeMode="cover"
            />
          )}

          {/* ACTIONS */}
          {showActions && (
            <View style={styles.actions}>
              <View style={styles.actionSlot}>
                <View style={styles.action}>
                  <Pressable
                    onPress={() => {
                      pop(replyScale);
                      onReply();
                    }}
                    hitSlop={6}
                    pressRetentionOffset={6}
                    style={styles.iconPressable}
                  >
                    <Animated.View style={{ transform: [{ scale: replyScale }] }}>
                      <SimpleLineIcons name="bubble" size={20} color={colors.icon} />
                    </Animated.View>
                  </Pressable>

                  {showActionCounts && (
                    <ThemedText
                      style={[
                        styles.actionCount,
                        { color: colors.textSecondary, opacity: replyCount > 0 ? 1 : 0 },
                      ]}
                    >
                      {replyCount > 0 ? formatCount(replyCount) : '0'}
                    </ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.actionSlot}>
                <View style={styles.action}>
                  <Pressable
                    onPress={() => pop(repostScale)}
                    onLongPress={() => {
                      pop(repostScale);
                      onQuote();
                    }}
                    delayLongPress={250}
                    hitSlop={6}
                    pressRetentionOffset={6}
                    style={styles.iconPressable}
                  >
                    <Animated.View style={{ transform: [{ scale: repostScale }] }}>
                      <IconSymbol name="arrow.2.squarepath" size={23} color={colors.icon} />
                    </Animated.View>
                  </Pressable>

                  {showActionCounts && (
                    <ThemedText
                      style={[
                        styles.actionCount,
                        { color: colors.textSecondary, opacity: repostCount > 0 ? 1 : 0 },
                      ]}
                    >
                      {repostCount > 0 ? formatCount(repostCount) : '0'}
                    </ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.actionSlot}>
                <View style={styles.action}>
                  <Ionicons name="heart-outline" size={22} color={colors.icon} />
                  {showActionCounts && (
                    <ThemedText
                      style={[
                        styles.actionCount,
                        { color: colors.textSecondary, opacity: likeCount > 0 ? 1 : 0 },
                      ]}
                    >
                      {likeCount > 0 ? formatCount(likeCount) : '0'}
                    </ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.actionSlot}>
                <View style={styles.action}>
                  <Ionicons name="share-outline" size={22} color={colors.icon} />
                  {showActionCounts && <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  rightCol: {
    flex: 1,
    paddingTop: 2,
  },

  rightColReply: {
    paddingTop: 0,
  },

  avatarPress: {
    alignSelf: 'flex-start',
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
  },

  avatarDetail: {
    width: 48,
    height: 48,
    borderRadius: 999,
  },

  name: {
    fontSize: 16,
    maxWidth: 160,
  },

  nameDetail: {
    fontSize: 18,
  },

  handleInline: {
    fontSize: 15,
    opacity: 0.9,
    flexShrink: 1,
  },

  headerInline: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: 2,
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },

  inlinePress: {
    alignSelf: 'flex-start',
  },

  replyingInline: {
    marginTop: 0,
  },

  replyingText: {
    fontSize: 14,
  },

  text: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },

  textReply: {
    marginTop: 0,
  },

  textDetail: {
    fontSize: 18,
    lineHeight: 24,
    marginTop: 10,
  },

  media: {
    marginTop: 10,
    width: '100%',
    height: 220,
    borderRadius: 16,
  },

  mediaDetail: {
    height: 260,
  },

  dateLine: {
    marginTop: 12,
    fontSize: 13,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },

  countsRow: {
    flexDirection: 'row',
    gap: 16,
  },

  countItem: {
    fontSize: 14,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },

  actionsDetail: {
    paddingTop: 4,
  },

  actionSlot: {
    flex: 1,
    alignItems: 'center',
  },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  actionCount: {
    fontSize: 14,
    minWidth: 18,
  },

  iconPressable: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 999,
  },

  quoteCard: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },

  quoteInner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },

  quoteAvatar: {
    width: 22,
    height: 22,
    borderRadius: 999,
    marginTop: 2,
  },

  quoteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },

  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  detailHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },

  detailNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },

});