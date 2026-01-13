export const HANDLE_REGEX = /^[a-z0-9_]+$/;

export function normalizeHandle(input: unknown): string {
  return String(input ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function validateHandle(handle: string): string | null {
  const h = normalizeHandle(handle);
  if (!h) return "Invalid handle";
  // Keep this permissive to avoid breaking existing data.
  if (h.length > 128) return "Invalid handle";
  if (!HANDLE_REGEX.test(h)) {
    return "Handle can only contain letters, numbers, and underscores.";
  }
  return null;
}
