// mobile/components/ui/AvatarSaver.tsx
import * as FileSystem from "expo-file-system/legacy";

const MEDIA_DIR = `${FileSystem.documentDirectory}feedverse-media/`;

async function ensureMediaDir() {
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
    }
  } catch {
    // ignore
  }
  return MEDIA_DIR;
}

function guessExt(uri: string) {
  const clean = uri.split("?")[0];
  const ext = clean.split(".").pop()?.toLowerCase();
  if (!ext || ext.length > 6) return "jpg";
  return ext;
}

export async function persistImageToAppStorage(
  uri: string,
  prefix: "avatar" | "header" | "img" = "img"
): Promise<string> {
  const dir = await ensureMediaDir();
  const ext = guessExt(uri);
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = `${dir}${filename}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    // fallback to original (still works, just may not survive)
    return uri;
  }
}
