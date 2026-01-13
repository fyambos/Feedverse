// mobile/lib/validation/auth.ts

export const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 24;

export function normalizeUsernameInput(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX_LEN);
}

export function normalizeUsernameForCreate(value: string) {
  const u = normalizeUsernameInput(value);
  return u || "user";
}

export function getUsernameValidationError(value: string): string | null {
  const u = normalizeUsernameInput(value);
  if (!u) return "Username is required.";
  if (u.length < USERNAME_MIN_LEN) return `Use at least ${USERNAME_MIN_LEN} characters.`;
  if (u.length > USERNAME_MAX_LEN) return `Use at most ${USERNAME_MAX_LEN} characters.`;
  // normalizeUsernameInput already strips invalid chars, but keep this for safety.
  if (!/^[a-z0-9_]+$/.test(u)) return "Use only letters, numbers, and underscores.";
  return null;
}

export function isValidUsername(value: string) {
  return getUsernameValidationError(value) == null;
}

export function getPasswordValidationError(value: string): string | null {
  const v = String(value ?? "");
  if (v.length < PASSWORD_MIN_LEN) return `Use at least ${PASSWORD_MIN_LEN} characters.`;
  if (v.length > PASSWORD_MAX_LEN) return `Use at most ${PASSWORD_MAX_LEN} characters.`;
  if (!/[A-Za-z]/.test(v)) return "Include at least one letter.";
  if (!/[0-9]/.test(v)) return "Include at least one number.";
  return null;
}

export function isValidPassword(value: string) {
  return getPasswordValidationError(value) == null;
}