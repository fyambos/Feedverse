import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SimpleLineIcons from '@expo/vector-icons/SimpleLineIcons';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type PostProfile = {
  displayName: string;
  handle: string;
  avatarUrl: string;
};

type PostItem = {
  id: string;
  text: string;
  createdAt: string;
  imageUrl?: string | null;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  parentPostId?: string;
};

function formatRelativeTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();

  // Future / invalid dates: fall back to absolute.
  if (!Number.isFinite(diff) || diff < 0) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const abs = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  const sid = String(scenarioId ?? scenarioIdParam ?? '');
  const handleSlug = profile.handle;

  const openProfile = () => {
    if (!sid || !handleSlug) return;

    const path = `/(scenario)/${encodeURIComponent(sid)}/(tabs)/profile/${encodeURIComponent(
      handleSlug
    )}`;

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

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Pressable onPress={openProfile} hitSlop={0} style={styles.avatarPress}>
          <Image
            source={{ uri: profile.avatarUrl }}
            style={[styles.avatar, isDetail && styles.avatarDetail]}
          />
        </Pressable>

        {isDetail ? (
          <View style={styles.headerStack}>
            <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
              <ThemedText type="defaultSemiBold" style={[styles.name, styles.nameDetail]}>
                {profile.displayName}
              </ThemedText>
            </Pressable>

            <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
              <ThemedText style={[styles.handle, { color: colors.textSecondary }]}>
                @{profile.handle}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerInline}>
            <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
              <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
                {profile.displayName}
              </ThemedText>
            </Pressable>

            <Pressable onPress={openProfile} hitSlop={0} style={styles.inlinePress}>
              <ThemedText
                style={[styles.handleInline, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                @{profile.handle} · {formatRelativeTime(item.createdAt)}
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {isReply && !!replyingToHandle && (
        <View style={styles.replyingRow}>
          <ThemedText style={[styles.replyingText, { color: colors.textSecondary }]}>
            replying to <ThemedText type="link">@{replyingToHandle}</ThemedText>
          </ThemedText>
        </View>
      )}

      <View style={isDetail ? styles.fullWidth : styles.indented}>
        <ThemedText style={[styles.text, isDetail && styles.textDetail]}>{item.text}</ThemedText>

        {!!item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={[
              styles.media,
              isDetail && styles.mediaDetail,
              { backgroundColor: scheme === 'dark' ? '#111' : '#eaeaea' },
            ]}
            resizeMode="cover"
          />
        )}

        {isDetail && (
          <ThemedText style={[styles.dateLine, { color: colors.textSecondary }]}>
            {formatFullDate(item.createdAt)}
          </ThemedText>
        )}

        {hasDetailCounts && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.countsRow}>
              {repostCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(repostCount)}</ThemedText> Reposts
                </ThemedText>
              )}
              {likeCount > 0 && (
                <ThemedText style={[styles.countItem, { color: colors.text }]}>
                  <ThemedText type="defaultSemiBold">{formatCount(likeCount)}</ThemedText> Likes
                </ThemedText>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {showActions && (
          <View style={styles.actions}>
            <View style={styles.actionSlot}>
              <Pressable
                onPress={onReply}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.action,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <SimpleLineIcons name="bubble" size={20} color={colors.icon} />
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
              </Pressable>
            </View>

            <View style={styles.actionSlot}>
              <View style={styles.action}>
                <IconSymbol name="arrow.2.squarepath" size={22} color={colors.icon} />
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
                {showActionCounts && (
                  <ThemedText style={[styles.actionCount, { opacity: 0 }]}>0</ThemedText>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headerStack: {
    flex: 1,
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
  },

  name: {
    fontSize: 16,
    maxWidth: 160,
  },
  nameDetail: {
    fontSize: 18,
  },

  handle: {
    fontSize: 15,
    opacity: 0.9,
  },

  headerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
    flex: 1,
  },

  handleInline: {
    fontSize: 15,
    opacity: 0.9,
    flexShrink: 1,
  },

  inlinePress: {
    alignSelf: 'flex-start',
  },

  replyingRow: {
    marginLeft: 56,
    marginTop: 0,
  },

  replyingText: {
    fontSize: 13,
    opacity: 0.9,
  },

  indented: {
    marginLeft: 56,
  },

  fullWidth: {
    marginTop: 8,
  },

  text: {
    fontSize: 15,
    lineHeight: 20,
  },

  textDetail: {
    fontSize: 18,
    lineHeight: 24,
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
});
