import * as FileSystem from "expo-file-system/legacy";

export async function ensureMediaDir() {
  const dir = `${FileSystem.documentDirectory}feedverse-media/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

function extFromUri(uri: string) {
  const clean = uri.split("?")[0];
  const m = clean.match(/\.(jpg|jpeg|png|webp|heic)$/i);
  return (m?.[1] ?? "jpg").toLowerCase();
}

/**
 * Persist an image into app storage so URIs stay valid in your DB.
 * Works for both local URIs (picked) and remote URLs.
 */
export async function persistToAppStorage(uri: string, prefix: "avatar" | "header" | "img" = "img") {
  const dir = await ensureMediaDir();
  const ext = extFromUri(uri);
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = `${dir}${filename}`;

  try {
    // remote => download
    if (/^https?:\/\//i.test(uri)) {
      const dl = await FileSystem.downloadAsync(uri, dest);
      return dl.uri;
    }

    // local => copy
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    // fallback: still return something usable
    return uri;
  }
}
