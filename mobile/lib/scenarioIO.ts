import { Alert } from "react-native";

type DefaultIO = {
  includeProfiles: boolean;
  includePosts: boolean;
  includeReposts: boolean;
  includeSheets: boolean;
};

type CreateScenarioIOArgs = {
  isReady: boolean;
  userId?: string | null;

  // db is only used to compute "my profiles"
  db?: any;

  // APIs
  previewImportScenarioFromFile: (io: DefaultIO) => Promise<any>;
  importScenarioFromFile: (io: DefaultIO) => Promise<any>;
  exportScenarioToFile: (args: any) => Promise<any>;

  // optional navigation hook (scenario list uses it, feed might not)
  onImportedNavigate?: (scenarioId: string) => void;
};

export function createScenarioIO({
  isReady,
  userId,
  db,
  previewImportScenarioFromFile,
  importScenarioFromFile,
  exportScenarioToFile,
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
          },
        },
      ]);
    })();
  };

  const exportAllProfiles = async (scenarioId: string) => {
    if (!isReady) {
      Alert.alert("Not ready", "Please wait for the app to finish loading.");
      return;
    }

    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    const res = await exportScenarioToFile({
      scenarioId: sid,
      ...DEFAULT_IO,
      profileIds: undefined, // all
    });

    if (!res?.ok) {
      Alert.alert("Export failed", res?.error ?? "Could not export.");
      return;
    }

    Alert.alert(
      "Exported!",
      `file: ${res.filename}\nprofiles: ${res.counts.profiles}\nposts: ${res.counts.posts}\nreposts: ${res.counts.reposts}\nsheets: ${res.counts.sheets}`
    );
  };

  const exportMyUserOnly = async (scenarioId: string) => {
    if (!isReady) {
      Alert.alert("Not ready", "Please wait for the app to finish loading.");
      return;
    }

    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    const uid = String(userId ?? "").trim();
    if (!uid) {
      Alert.alert("Not logged in", "Please log in first.");
      return;
    }

    const profilesMap = db?.profiles ?? {};
    const myProfileIds = Object.values(profilesMap)
      .filter((p: any) => String(p?.scenarioId) === sid && String(p?.ownerUserId) === uid)
      .map((p: any) => String(p?.id))
      .filter(Boolean);

    if (!myProfileIds.length) {
      Alert.alert("Nothing to export", "You don’t own any profiles in this scenario.");
      return;
    }

    const res = await exportScenarioToFile({
      scenarioId: sid,
      ...DEFAULT_IO,
      profileIds: myProfileIds,
    });

    if (!res?.ok) {
      Alert.alert("Export failed", res?.error ?? "Could not export.");
      return;
    }

    Alert.alert(
      "Exported!",
      `file: ${res.filename}\nprofiles: ${res.counts.profiles}\nposts: ${res.counts.posts}\nreposts: ${res.counts.reposts}\nsheets: ${res.counts.sheets}`
    );
  };

  const openExportChoice = (scenarioId: string, opts?: { onBeforeOpen?: () => void }) => {
    if (!isReady) {
      Alert.alert("Not ready", "Please wait for the app to finish loading.");
      return;
    }
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    // useful for closing your sheet BEFORE showing the choice Alert
    opts?.onBeforeOpen?.();

    Alert.alert("Export", "What do you want to export?", [
      { text: "All profiles", onPress: () => void exportAllProfiles(sid) },
      { text: "Only my user", onPress: () => void exportMyUserOnly(sid) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return {
    runImportFlow,
    openExportChoice,
    exportAllProfiles,
    exportMyUserOnly,
  };
}