import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Feedverse</ThemedText>
      <ThemedText type="default">
        a social network for fictional worlds 
      </ThemedText>
      <ThemedText type="subtitle" style={styles.subtitle}>
        tell stories socially and build your universe in a feed
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    gap: 12,
  },
  subtitle: {
    marginTop: 8,
  },
});
