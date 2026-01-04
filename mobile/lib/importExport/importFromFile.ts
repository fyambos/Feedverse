// mobile/lib/importExport/importFromFile.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { InteractionManager, Platform } from "react-native";

async function waitForNativeSheetSafeWindow() {
  await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => setTimeout(resolve, Platform.OS === "ios" ? 350 : 50));
}

let activePick: Promise<
  | { ok: true; raw: any; jsonBytes: number; fileName?: string; uri?: string }
  | { ok: false; error: string }
> | null = null;

export async function pickScenarioExportJson(): Promise<
  | { ok: true; raw: any; jsonBytes: number; fileName?: string; uri?: string }
  | { ok: false; error: string }
> {
  // Prevent concurrent pickers (iOS throws: "Different document picking in progress").
  if (activePick) {
    return { ok: false, error: "Import already in progress" };
  }

  activePick = (async () => {
    // iOS can no-op if we try to present while another modal is dismissing.
    await waitForNativeSheetSafeWindow();

    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e ?? "Picker failed") };
    }

    if (res.canceled) return { ok: false, error: "Import canceled" };

    const file = res.assets?.[0];
    if (!file?.uri) return { ok: false, error: "No file selected" };

    try {
      const info = await FileSystem.getInfoAsync(file.uri);
      const jsonBytes = typeof (info as any)?.size === "number" ? (info as any).size : 0;

      const text = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const bytes = jsonBytes || text.length;

      const raw = JSON.parse(text);
      return { ok: true, raw, jsonBytes: bytes, fileName: file.name, uri: file.uri };
    } catch (e: any) {
      return { ok: false, error: `Invalid JSON file: ${String(e?.message ?? e)}` };
    }
  })();

  try {
    return await activePick;
  } finally {
    activePick = null;
  }
}