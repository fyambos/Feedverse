import { StyleSheet, FlatList, Pressable, Image, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router, Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MOCK_SCENARIOS } from '@/mocks/scenarios';

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
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              {/* Scenario image */}
              <Image
                source={{ uri: item.cover }}
                style={styles.cover}
                resizeMode="cover"
              />

              <View style={styles.cardContent}>
                <ThemedText type="defaultSemiBold">{item.name}</ThemedText>

                <View style={styles.playersRow}>
                  <View style={styles.avatars}>
                    {item.players.slice(0, 4).map((player, index) => (
                      <Image
                        key={player.id}
                        source={{ uri: player.avatar }}
                        style={[
                          styles.avatar,
                          { marginLeft: index === 0 ? 0 : -8 },
                        ]}
                      />
                    ))}
                  </View>

                  <ThemedText style={[styles.playerCount, { color: colors.textMuted }]}>
                    {item.players.length} players
                  </ThemedText>
                </View>
              </View>
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
  borderRadius: 14,
  borderWidth: 1,
  overflow: 'hidden',
  },

  cover: {
    width: '100%',
    height: 120,
  },

  cardContent: {
    padding: 12,
    gap: 8,
  },

  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#000',
  },

  playerCount: {
    fontSize: 12,
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
