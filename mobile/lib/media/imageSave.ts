// mobile/lib/media/imageSave.ts
import { Alert as NativeAlert, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Alert as DialogAlert } from "@/context/dialog";

function alert(title: string, message?: string, buttons?: any[]) {
  if (Platform.OS === "ios") {
    // Use native iOS alerts for all save-related messaging.
    // RN Alert supports button arrays; types vary across RN/Expo versions, so keep it loose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (NativeAlert as any).alert(title, message, buttons);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (DialogAlert as any).alert(title, message, buttons);
}

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

    // Keep iOS behavior: save to Photos and show native alert.
    if (Platform.OS === "ios") {
      // Ask permission (needed for true gallery save)
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        // If permission denied, at least offer Share
        if (await Sharing.isAvailableAsync()) {
          alert(
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

        alert("Permission needed", "Allow Photos permission to save images.");
        return;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      alert("Saved", "Image saved to your Photos.");
      return;
    }

    // Non-iOS: open Share sheet directly (no Photos permission needed).
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri);
      // No success alert here: the user action in the share sheet determines what happens.
      return;
    }

    // Fallback (rare): if Share isn't available, attempt a direct save.
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      alert("Save not available", "Could not open Share, and Photos permission is not granted.");
      return;
    }

    await MediaLibrary.saveToLibraryAsync(localUri);
    alert("Saved", "Image saved to your Photos.");
  } catch (e) {
    // Expo Go on Android may fail here; fallback to Sharing if possible
    try {
      if (await Sharing.isAvailableAsync()) {
        alert(
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

    alert("Could not save", "Something went wrong while saving this image.");
  }
}
