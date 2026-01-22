import { Alert } from "../../context/dialog";
import { InteractionManager } from "react-native";

async function waitForInteractions() {
  await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
}

type DefaultIO = {
  includeProfiles: boolean;
  includePosts: boolean;
  includeReposts: boolean;
  includeSheets: boolean;
};

type CreateScenarioIOArgs = {
  isReady: boolean;

  // APIs
  previewImportScenarioFromFile: (io: DefaultIO) => Promise<any>;
  importScenarioFromFile: (io: DefaultIO) => Promise<any>;

  // optional navigation hook (scenario list uses it, feed might not)
  onImportedNavigate?: (scenarioId: string) => void;
};

export function createScenarioIO({
  isReady,
  previewImportScenarioFromFile,
  importScenarioFromFile,
  onImportedNavigate,
}: CreateScenarioIOArgs) {
  const DEFAULT_IO: DefaultIO = {
    includeProfiles: true,
    includePosts: true,
    includeReposts: true,
    includeSheets: true,
  };

  const runImportFlow = () => {
    if (!isReady) {
      Alert.alert("Not ready", "Please wait for the app to finish loading.");
      return;
    }

    void (async () => {
      // iOS: ensure any menu/dialog dismissal finishes before we present the document picker.
      await waitForInteractions();

      const preview = await previewImportScenarioFromFile(DEFAULT_IO);
      if (!preview?.ok) {
        Alert.alert("Import failed", preview?.error ?? "Could not import.");
        return;
      }

      const p = preview.preview;
      const fileLabel = preview.fileName ? `\n\nfile: ${preview.fileName}` : "";

      const renamed = p?.renamedHandles?.length ? `\nrenamed handles: ${p.renamedHandles.length}` : "";

      const skippedAny =
        ((p?.skipped?.profilesDueToLimit ?? 0) +
          (p?.skipped?.postsDueToMissingProfile ?? 0) +
          (p?.skipped?.repostsDueToMissingProfileOrPost ?? 0) +
          (p?.skipped?.sheetsDueToMissingProfile ?? 0)) > 0;

      const skippedText = skippedAny
        ? `\n\nskipped:\n• profiles (limit): ${p.skipped.profilesDueToLimit}\n• posts (missing profile): ${p.skipped.postsDueToMissingProfile}\n• reposts (missing refs): ${p.skipped.repostsDueToMissingProfileOrPost}\n• sheets (missing profile): ${p.skipped.sheetsDueToMissingProfile}`
        : "";

      const msg =
        `this will import:\n` +
        `• profiles: ${p.importedProfiles}\n` +
        `• posts: ${p.importedPosts}\n` +
        `• reposts: ${p.importedReposts}\n` +
        `• sheets: ${p.importedSheets}` +
        renamed +
        fileLabel +
        skippedText;

      Alert.alert("Import preview", msg, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          style: "destructive",
          onPress: () => {
            // Give iOS a moment to dismiss the preview dialog before we do any
            // native presentation (document picker may re-open for final import).
            setTimeout(() => {
              void (async () => {
                const res = await importScenarioFromFile(DEFAULT_IO);
                if (!res?.ok) {
                  Alert.alert("Import failed", res?.error ?? "Could not import.");
                  return;
                }

                Alert.alert(
                  "Imported!",
                  `scenario created: ${res.scenarioId}\nprofiles: ${res.importedProfiles}\nposts: ${res.importedPosts}`
                );

                if (onImportedNavigate) onImportedNavigate(String(res.scenarioId));
              })();
            }, 350);
          },
        },
      ]);
    })();
  };

  return {
    runImportFlow,
  };
}