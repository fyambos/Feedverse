import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { persistToAppStorage } from "@/lib/media/imagePersist";

export async function takeAndPersistPhoto(
  prefix: "img" | "avatar" | "header" = "img"
) {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Camera permission", "Please allow camera access to take a photo.");
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });

  if (result.canceled) return null;

  const uri = result.assets?.[0]?.uri;
  if (!uri) return null;

  // persist so URI survives app restarts
  return await persistToAppStorage(uri, prefix);
}