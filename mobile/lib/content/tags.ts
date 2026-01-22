// mobile/lib/tags.ts

export type GlobalTag = {
  key: string;  // canonical key (case-insensitive)
  name: string; // display label (generated)
  color: string; // deterministic, locked
};

/**
 * Only allow letters / numbers / spaces.
 * Also collapses multiple spaces and trims.
 */
export function sanitizeTagInput(raw: string) {
  const onlyAllowed = String(raw ?? "")
    .replace(/[^a-zA-Z0-9 ]+/g, "") // remove everything except letters/numbers/spaces
    .replace(/\s+/g, " ")          // collapse spaces
    .trim();

  return onlyAllowed;
}

/**
 * Canonical key. Case-insensitive.
 * Uses lowercase and dashes.
 *
 * "Group Chat" -> "group-chat"
 * " ROMCOM " -> "romcom"
 */
export function tagKeyFromInput(raw: string) {
  const clean = sanitizeTagInput(raw);
  if (!clean) return "";

  return clean
    .toLowerCase()
    .replace(/ /g, "-"); // spaces -> dash
}

/**
 * Display name generated from key (not from user input).
 * "group-chat" -> "Group chat"
 * "romcom" -> "Romcom"
 *
 * Rule: first letter uppercase, rest lowercase, dashes -> spaces.
 */
export function tagNameFromKey(key: string) {
  const s = String(key ?? "").trim().toLowerCase();
  if (!s) return "";

  const spaced = s.replace(/-+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Deterministic color from key: stable across devices/users.
 * Choose a fixed palette you like and map key -> palette index via hash.
 */

const TAG_PALETTE = [
  "#ffc65cff",
  "#fd92d0ff",
  "#83fad3ff",
  "#9db7ffff",
  "#d8b4feff",
  "#ff8aaeff",
  "#22c55eff",
  "#f59e0bff",
  "#60a5faff",
  "#34d399ff",
  "#f87171ff",
  "#a78bfaff",
];

function hashStringToInt(input: string) {
  // small stable hash (FNV-1a-ish)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorForTagKey(key: string) {
  const k = String(key ?? "").toLowerCase().trim();
  if (!k) return TAG_PALETTE[0];
  const idx = hashStringToInt(k) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

/**
 * Build the canonical tag object (name + locked color).
 */
export function buildGlobalTagFromKey(key: string): GlobalTag | null {
  const k = String(key ?? "").trim().toLowerCase();
  if (!k) return null;

  return {
    key: k,
    name: tagNameFromKey(k),
    color: colorForTagKey(k),
  };
}
export function normalizeTagKey(raw: string) {
  const clean = sanitizeTagInput(raw);
  if (!clean) return "";
  return clean.toLowerCase().replace(/ /g, "-"); // spaces -> dash
}