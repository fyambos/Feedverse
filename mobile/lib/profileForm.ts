// mobile/lib/profileForm.ts

/* -------------------------------------------------------------------------- */
/* Field security (front-only)                                                */
/* -------------------------------------------------------------------------- */

export const PROFILE_LIMITS = {
  MAX_DISPLAY_NAME: 50,
  MAX_HANDLE: 20,
  MAX_BIO: 160,
  MAX_LOCATION: 30,
  MAX_LINK: 120,

  MAX_COUNT: 99_000_000,
};

export const MAX_COUNT_DIGITS = String(PROFILE_LIMITS.MAX_COUNT).length; // 8

export function trimTo(s: string, max: number) {
  return String(s ?? "").trim().slice(0, max);
}

export function normalizeHandle(input: string) {
  // remove @, lowercase, keep only a-z 0-9 _
  const raw = String(input ?? "").trim().replace(/^@+/, "").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_]/g, "");
  return cleaned.slice(0, PROFILE_LIMITS.MAX_HANDLE);
}

export function normalizeBio(input: string) {
  // collapse whitespace/newlines; keep readable
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, PROFILE_LIMITS.MAX_BIO);
}

export function normalizeLocation(input: string) {
  return trimTo(input, PROFILE_LIMITS.MAX_LOCATION);
}

export function normalizeLink(input: string) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  // permissive; just prevent absurd length
  return s.slice(0, PROFILE_LIMITS.MAX_LINK);
}

export function clampInt(n: number, min = 0, max = PROFILE_LIMITS.MAX_COUNT) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

export function pickFollowersForSize(size: "small" | "mid" | "big") {
  if (size === "small") return randInt(0, 500);
  if (size === "mid") return randInt(1000, 5000);
  return randInt(800_000, 3_000_000);
}

export function pickFollowingBelowFollowers(followers: number) {
  if (followers <= 0) return 0;
  const max = Math.max(0, followers - 1);
  const min = Math.max(0, Math.floor(followers * 0.05));
  const hi = Math.max(min, Math.floor(followers * 0.7));
  return clampInt(randInt(min, Math.min(hi, max)), 0, max);
}

export function digitsOnly(s: string) {
  return String(s ?? "").replace(/[^\d]/g, "");
}

export function limitCountText(s: string) {
  // digits only + limit typing length
  const raw = digitsOnly(s).slice(0, MAX_COUNT_DIGITS);
  const n = Number(raw || "0") || 0;
  return String(Math.min(n, PROFILE_LIMITS.MAX_COUNT));
}