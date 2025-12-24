// mobile/components/ui/AvatarPicker.tsx
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { persistToAppStorage } from "@/lib/media/imagePersist";

type PickOneOpts = {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  persistAs?: "avatar" | "header" | "img";
};

export async function pickAndPersistOneImage(opts: PickOneOpts = {}): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", "Enable photo access to pick images.");
    return null;
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts.allowsEditing ?? true,
    aspect: opts.aspect,
    quality: opts.quality ?? 0.9,
  });

  if (res.canceled) return null;

  const uri = res.assets?.[0]?.uri;
  if (!uri) return null;

  return await persistToAppStorage(uri, opts.persistAs ?? "img");
}

type PickManyOpts = {
  remaining: number; // how many you can still pick
  quality?: number;
  persistAs?: "img";
};

export async function pickAndPersistManyImages(opts: PickManyOpts): Promise<string[]> {
  const remaining = Math.max(0, Math.floor(opts.remaining));
  if (remaining <= 0) return [];

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", "Please allow photo library access to add images.");
    return [];
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: opts.quality ?? 0.9,
  });

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
