// mobile/lib/importExport/exportScenario.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ScenarioExportBundleV1 } from "./exportTypes";

export async function saveAndShareScenarioExport(bundle: ScenarioExportBundleV1) {
  const json = JSON.stringify(bundle, null, 2);
  const filename = `feedverse-scenario-${bundle.scenario.id}-${Date.now()}.json`;
  const uri = FileSystem.documentDirectory + filename;

  await FileSystem.writeAsStringAsync(uri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // opens share sheet (Files app, AirDrop, Drive, etc.)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }

  return { uri, filename };
}