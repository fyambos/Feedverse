// mobile/components/ui/ImagePicker.ts
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { persistToAppStorage } from "@/lib/media/imagePersist";

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
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", "Enable photo access to pick images.");
    return false;
  }
  return true;
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
