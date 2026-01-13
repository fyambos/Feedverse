import { normalizeHandle, validateHandle } from "./handle";

/**
 * Extracts @handle mentions from arbitrary text.
 *
 * Rules:
 * - Mentions must be at start or preceded by a non-word character (not [A-Za-z0-9_])
 *   to avoid matching emails like "test@example.com".
 * - Handles are normalized via normalizeHandle() (lowercased, leading @ removed).
 * - Invalid handles are dropped.
 */
export function extractMentionHandles(text: string): string[] {
  const raw = String(text ?? "");
  if (!raw) return [];

  // Capture group 2 is the handle without the leading '@'.
  const re = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,128})\b/g;

  const unique = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const token = match[2];
    const handle = normalizeHandle(token);
    if (!handle) continue;
    if (validateHandle(handle)) continue;
    unique.add(handle);
  }

  return Array.from(unique);
}
