import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View
          style={[
            styles.centerWrap,
            {
              paddingTop: (styles.centerWrap.paddingTop as number) + (insets.top || 0),
              paddingBottom: (styles.centerWrap.paddingBottom as number) + (insets.bottom || 0),
            },
          ]}
        >
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

        <View
          style={[
            styles.bottomBar,
            {
              borderTopColor: colors.border,
              paddingBottom: 14 + (insets.bottom || 0),
              paddingTop: 14,
            },
          ]}
        >
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
    paddingBottom: 0,
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});