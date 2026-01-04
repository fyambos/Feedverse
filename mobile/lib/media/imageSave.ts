// mobile/lib/media/imageSave.ts
import { Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Alert } from "@/context/dialog";

export async function saveImageToDevice(uri: string) {
  try {
    // Download remote -> local first (both MediaLibrary + Sharing prefer local files)
    let localUri = uri;

    if (/^https?:\/\//i.test(uri)) {
      const filename = `feedverse_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.jpg`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const dl = await FileSystem.downloadAsync(uri, dest);
      localUri = dl.uri;
    }

    // Ask permission (needed for true gallery save)
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      // If permission denied, at least offer Share
      if (await Sharing.isAvailableAsync()) {
        Alert.alert(
          "Permission needed",
          "Allow Photos permission to save images. For now you can share it instead.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Share",
              onPress: () => Sharing.shareAsync(localUri).catch(() => {}),
            },
          ]
        );
        return;
      }

      Alert.alert("Permission needed", "Allow Photos permission to save images.");
      return;
    }

    // Try save to gallery
    await MediaLibrary.saveToLibraryAsync(localUri);
    Alert.alert("Saved", "Image saved to your Photos.");
  } catch (e) {
    // Expo Go on Android may fail here; fallback to Sharing if possible
    try {
      if (await Sharing.isAvailableAsync()) {
        Alert.alert(
          "Save not available here",
          Platform.OS === "android"
            ? "Expo Go can’t fully save to Gallery on Android anymore. Use Share to save it manually (or use a dev build for full saving)."
            : "Could not save directly. Use Share instead.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Share", onPress: () => Sharing.shareAsync(uri).catch(() => {}) },
          ]
        );
        return;
      }
    } catch {}

    Alert.alert("Could not save", "Something went wrong while saving this image.");
  }
}
