import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: (styles.content.paddingTop as number) + (insets.top || 0),
              paddingBottom:
                (styles.content.paddingBottom as number) + (insets.bottom || 0),
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

          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border,
              },
            ]}
          >
            {bottom}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kav: { flex: 1 },

  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
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
    borderRadius: 28,
    overflow: 'hidden',
  },

  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 18,
  },

  footer: {
    marginTop: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
  },
});