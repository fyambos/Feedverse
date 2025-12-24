import { Alert } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";

export async function saveImageToDevice(uri: string) {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow Photos permission to save images.");
      return;
    }

    let localUri = uri;

    // If remote, download to cache first
    if (/^https?:\/\//i.test(uri)) {
      const filename = `feedverse_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const dl = await FileSystem.downloadAsync(uri, dest);
      localUri = dl.uri;
    }

    await MediaLibrary.saveToLibraryAsync(localUri);
    Alert.alert("Saved", "Image saved to your Photos.");
  } catch {
    Alert.alert("Could not save", "Something went wrong while saving this image.");
  }
}
