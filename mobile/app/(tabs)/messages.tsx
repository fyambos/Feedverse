import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function MessagesScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">
        see private conversation of your profile
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
});
