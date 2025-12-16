import { StyleSheet, FlatList, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router, Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MOCK_SCENARIOS = [
  { id: 'demo-kpop', name: 'K-pop College AU' },
  { id: 'demo-royalty', name: 'Modern Royalty AU' },
  { id: 'demo-mafia', name: 'Mafia Cityverse' },
];

export default function ScenarioListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const openScenario = (scenarioId: string) => {
    router.push(`/(scenario)/${scenarioId}` as any);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Scenarios',
          headerTitleAlign: 'center',
          headerBackVisible: false,
        }}
      />

      <ThemedView style={styles.container}>
        <ThemedText style={styles.subtitle}>
          Choose a scenario to enter its universe
        </ThemedText>

        <FlatList
          data={MOCK_SCENARIOS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openScenario(item.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
                pressed && styles.cardPressed,
              ]}
            >
              <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
              <ThemedText
                style={[styles.cardHint, { color: colors.textSecondary }]} 
              >
                Tap to enter scenario
              </ThemedText>
            </Pressable>
          )}
        />
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
  },
  list: {
    paddingVertical: 8,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHint: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
});
