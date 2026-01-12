// mobile/components/ui/ImagePicker.ts
import { Alert } from "@/context/dialog";
import * as ImagePicker from "expo-image-picker";
import { persistToAppStorage } from "@/lib/media/imagePersist";
import { InteractionManager, Linking, Platform } from "react-native";

export type PersistKind = "avatar" | "header" | "img";

type PickCommon = {
  quality?: number;
  persistAs?: PersistKind;
};

export type PickOneOpts = PickCommon & {
  allowsEditing?: boolean;
  aspect?: [number, number];
};

export type PickManyOpts = PickCommon & {
  remaining: number; // how many you can still pick
};

async function ensurePermission(): Promise<boolean> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    // Newer Android versions may require READ_MEDIA_IMAGES and may return
    // canAskAgain=false when the user permanently denied the permission.
    if (perm.granted) return true;

    const canAskAgain = (perm as any)?.canAskAgain !== false;
    if (!canAskAgain) {
      Alert.alert(
        "Permission needed",
        "Photo access is blocked. Open app settings to enable photo permissions.",
        [
          { text: "Open settings", onPress: () => Linking.openSettings() },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return false;
    }

    // Fallback: inform the user to allow access and return false so caller can abort.
    Alert.alert("Permission needed", "Enable photo access to pick images.");
    return false;
  } catch (e) {
    // If the permission API itself throws, surface a friendly message
    console.warn("permission request failed", e);
    Alert.alert("Permission error", "Could not request photo permission.");
    return false;
  }
}

/**
 * Expo-image-picker changed typings across SDKs.
 * In your project, `ImagePicker.MediaType` doesn't exist, and `MediaTypeOptions` is deprecated.
 * The most compatible approach is to pass `mediaTypes` as a string array and cast to `any`.
 */
function imageOnlyMediaTypes(): any {
  return ["images"];
}

export async function pickAndPersistOneImage(
  opts: PickOneOpts = {}
): Promise<string | null> {
  const ok = await ensurePermission();
  if (!ok) return null;
  // Wait for animations / UI interactions to finish to avoid modal/popup
  // interference on some Android OEMs (e.g., Xiaomi) where a top-layer
  // modal can swallow the native picker intent.
  await new Promise((r) => InteractionManager.runAfterInteractions(r));

  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageOnlyMediaTypes(),
      allowsEditing: opts.allowsEditing ?? true,
      aspect: opts.aspect,
      quality: opts.quality ?? 0.9,
    } as any);

    if (res.canceled) return null;

    const uri = res.assets?.[0]?.uri;
    if (!uri) return null;

    return await persistToAppStorage(uri, opts.persistAs ?? "img");
  } catch (e) {
    console.warn("launchImageLibraryAsync failed", e);
    // On some devices the native picker may throw silently; show a helpful message
    Alert.alert(
      "Could not open gallery",
      Platform.OS === "android"
        ? "Could not open your photo gallery. Check app permissions or try restarting the app."
        : "Could not open your photo gallery."
    );
    return null;
  }
}

export async function pickAndPersistManyImages(opts: PickManyOpts): Promise<string[]> {
  const remaining = Math.max(0, Math.floor(opts.remaining));
  if (remaining <= 0) return [];

  const ok = await ensurePermission();
  if (!ok) return [];

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: imageOnlyMediaTypes(),
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: opts.quality ?? 0.9,
  } as any);

  if (res.canceled) return [];

  const uris = (res.assets ?? [])
    .map((a) => a?.uri)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const out: string[] = [];
  for (const uri of uris) {
    out.push(await persistToAppStorage(uri, opts.persistAs ?? "img"));
  }
  return out;
}
