import { ValidationError } from "../utils/models";
import { VALIDATION } from "../config/constants";
import { UserSettings } from "./userModels";

export const validateUsername = (username: string): ValidationError | null => {
  if (!username || username.trim().length === 0) {
    return {
      fields: "username",
      message: "Le nom d'utilisateur est requis",
    };
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3) {
    return {
      fields: "username",
      message: VALIDATION.USERNAME_MIN_LENGTH,
    };
  }

  if (trimmedUsername.length > 30) {
    return {
      fields: "username",
      message: VALIDATION.USERNAME_MAX_LENGTH,
    };
  }

  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(trimmedUsername)) {
    return {
      fields: "username",
      message: VALIDATION.USERNAME_INVALID_FORMAT,
    };
  }

  return null;
};

export const validateSettings = (
  settings: UserSettings,
): ValidationError | null => {
  if (!settings || typeof settings !== "object") {
    return {
      fields: "settings",
      message: "Les paramètres doivent être un objet valide",
    };
  }

  if (
    settings.showTimestamps !== undefined &&
    typeof settings.showTimestamps !== "boolean"
  ) {
    return {
      fields: "settings.showTimestamps",
      message: "showTimestamps doit être un booléen",
    };
  }

  if (settings.darkMode !== undefined) {
    const validModes = ["light", "dark", "system"];
    if (!validModes.includes(settings.darkMode)) {
      return {
        fields: "settings.darkMode",
        message: "darkMode doit être 'light', 'dark' ou 'system'",
      };
    }
  }

  return null;
};
