export const USERNAME_REGEX = /^[a-z0-9_]+$/;

export function normalizeUsername(input: unknown): string {
  return String(input ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function validateUsername(username: string): string | null {
  const u = normalizeUsername(username);
  if (!u) return "Invalid username";
  if (u.length < 3) return "Invalid username";
  // Keep this permissive on max length to avoid breaking existing users.
  if (u.length > 128) return "Invalid username";
  if (!USERNAME_REGEX.test(u)) {
    return "Username can only contain letters, numbers, and underscores.";
  }
  return null;
}
