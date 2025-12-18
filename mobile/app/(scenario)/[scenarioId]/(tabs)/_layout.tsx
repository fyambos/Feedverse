import { Tabs, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, Pressable } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
export default function TabLayout() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        headerTitleAlign: 'center', 
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',  
          headerTitle: () => ( 
            <Pressable
            onPress={() => router.push({
                                          pathname: '/modal/select-profile',
                                          params: { scenarioId: String(scenarioId) },
                                        } as any)
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Switch Profile"
          >
            <Image
              source={require('@/assets/images/FeedverseIcon.png')}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
            />
            </Pressable>
          ),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          headerTitle: 'Direct Messages',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="envelope.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="post/[postId]"
        options={{
          href: null,
          title: 'Post',
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons
                name="chevron-back"
                size={26}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}
