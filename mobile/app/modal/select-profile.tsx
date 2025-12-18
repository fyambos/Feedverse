import React, { use } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
export default function SelectProfileModal() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const { getUserProfilesForScenario, selectedProfileId, setSelectedProfileId } = useProfile();

  const sid = scenarioId ?? '';
  const profiles = getUserProfilesForScenario(sid);
  const current = selectedProfileId(sid);
    const { userId } = useAuth();
  return (
        <SafeAreaView
        edges={['top']}
        style={[styles.screen, { backgroundColor: colors.background }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
          Choose profile
        </ThemedText>

        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Done</ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(p: any) => p.id}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        )}
        renderItem={({ item }: any) => {
          const active = item.id === current;

          return (
            <Pressable
              onPress={async () => {
                await setSelectedProfileId(sid, item.id);
                router.back();
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.pressed : colors.background,
                },
              ]}
            >
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />

              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">{item.displayName}</ThemedText>
                <ThemedText style={{ color: colors.textSecondary }}>{item.handle}</ThemedText>
              </View>

              {active ? (
                <ThemedText style={{ color: colors.tint, fontWeight: '800' }}>✓</ThemedText>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <ThemedText style={{ color: colors.textSecondary }}>
              No profiles available for this scenario.
            </ThemedText>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 999 },
});