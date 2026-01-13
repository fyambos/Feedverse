// mobile/lib/validation/auth.ts

export const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

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