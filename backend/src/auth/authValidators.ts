import { ValidationError } from "../utils/models";

export const validateEmail = (email: string): ValidationError | null => {
  if (
    !email ||
    email.length === 0 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return {
      fields: "Email",
      message: "L'adresse email est invalide",
    };
  }
  return null;
};

export const nameFormatting = (username: string) => {
  return String(username)
    .toLocaleLowerCase()
    .replace(/[^a-zA-Z0-9]/g, "");
};

export const validatePassword = (password: string): ValidationError | null => {
  if (!password || password.length === 0) {
    return {
      fields: "Mot de passe",
      message: "Le mot de passe est invalide",
    };
  }
  return null;
};
