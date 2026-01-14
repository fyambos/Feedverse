import { Alert } from "@/context/dialog";
import * as ImagePicker from "expo-image-picker";
import { persistToAppStorage } from "@/lib/media/imagePersist";
import { Platform, Alert as RNAlert } from "react-native";

export async function takeAndPersistPhoto(
  prefix: "img" | "avatar" | "header" = "img"
) {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Camera permission", "Please allow camera access to take a photo.");
    return null;
  }

  let result: any;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
  } catch (e) {
    // Camera may be unavailable (no camera) or in use by another app — ask the user whether to pick from library
    try {
      let pick = false;

      if (Platform.OS === "ios") {
        pick = await new Promise<boolean>((resolve) => {
          RNAlert.alert(
            "Camera unavailable",
            "Your camera is not available or is being used by another app. Would you like to pick an existing photo instead?",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Pick from library", onPress: () => resolve(true) },
            ],
            { cancelable: true }
          );
        });
      } else {
        pick = await Alert.confirm({
          title: "Camera unavailable",
          message:
            "Your camera is not available or is being used by another app. Would you like to pick an existing photo instead?",
          confirmText: "Pick from library",
          cancelText: "Cancel",
        });
      }

      if (!pick) return null;

      // Give the dialog a moment to fully dismiss before launching the system picker
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Launch the system image library picker and persist result
      try {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 } as any);
        if (res.canceled) return null;
        const uri = res.assets?.[0]?.uri;
        if (!uri) return null;
        return await persistToAppStorage(uri, prefix);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  if (result.canceled) return null;

  const uri = result.assets?.[0]?.uri;
  if (!uri) return null;

  // persist so URI survives app restarts
  return await persistToAppStorage(uri, prefix);
}