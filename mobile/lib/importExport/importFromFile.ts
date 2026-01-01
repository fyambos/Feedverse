// mobile/lib/importExport/importFromFile.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

export async function pickScenarioExportJson(): Promise<
  | { ok: true; raw: any; jsonBytes: number; fileName?: string; uri?: string }
  | { ok: false; error: string }
> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (res.canceled) return { ok: false, error: "Import canceled" };

  const file = res.assets?.[0];
  if (!file?.uri) return { ok: false, error: "No file selected" };

  try {
    const info = await FileSystem.getInfoAsync(file.uri);
    const jsonBytes =
      typeof (info as any)?.size === "number"
        ? (info as any).size
        : 0;

    const text = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const bytes = jsonBytes || text.length;

    const raw = JSON.parse(text);
    return { ok: true, raw, jsonBytes: bytes, fileName: file.name, uri: file.uri };
  } catch (e: any) {
    return { ok: false, error: `Invalid JSON file: ${String(e?.message ?? e)}` };
  }
}