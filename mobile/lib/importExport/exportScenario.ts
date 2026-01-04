// mobile/lib/importExport/exportScenario.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { InteractionManager, Platform, Share } from "react-native";
import { ScenarioExportBundleV1 } from "./exportTypes";

async function waitForInteractions() {
  await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
}

async function waitForNativeSheetSafeWindow() {
  await waitForInteractions();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => setTimeout(resolve, Platform.OS === "ios" ? 350 : 50));
}

async function shareFileUri(uri: string, filename: string) {
  // Prefer expo-sharing when available, but fall back to RN Share
  // (e.g. iOS Expo Go, or rare iOS presentation no-ops).
  try {
    if (await Sharing.isAvailableAsync()) {
      await waitForNativeSheetSafeWindow();
      await Sharing.shareAsync(uri, {
        dialogTitle: filename,
        mimeType: "application/json",
        UTI: "public.json",
      });
      return;
    }
  } catch {
    // fall through
  }

  await waitForNativeSheetSafeWindow();
  await Share.share({
    title: filename,
    message: filename,
    url: uri,
  });
}

export async function saveAndShareScenarioExport(bundle: ScenarioExportBundleV1) {
  const json = JSON.stringify(bundle, null, 2);
  const filename = `feedverse-scenario-${bundle.scenario.id}-${Date.now()}.json`;
  const uri = FileSystem.documentDirectory + filename;

  await FileSystem.writeAsStringAsync(uri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // Open share sheet (Files app, AirDrop, Drive, etc.) so the user can choose where to save.
  // iOS is sensitive to modal-dismiss timing; use a conservative delay + fallback.
  await shareFileUri(uri, filename);

  return { uri, filename };
}