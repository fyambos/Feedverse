import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function AuthScreen({
  title,
  children,
  bottom,
}: {
  title: string;
  children: React.ReactNode;
  bottom: React.ReactNode;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.centerWrap}>
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/FeedverseIcon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <ThemedText style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>

          {children}
        </View>

        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          {bottom}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kav: { flex: 1 },

  centerWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    justifyContent: 'flex-start',
  },

  logoWrap: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 14,
  },
  logoImage: {
    width: 56,
    height: 56,
  },

  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 18,
  },

  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});