// mobile/lib/postComposer/counts.ts
export const MAX_COUNT = 999_999_999_999;
export const MAX_COUNT_DIGITS = 12;

export function clampInt(n: number, min = 0, max = MAX_COUNT) {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, x));
}

export function randInt(min: number, max: number) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function digitsOnly(s: string) {
  return String(s ?? "").replace(/[^\d]/g, "");
}

export function toCountStringOrEmpty(n: number) {
  return n > 0 ? String(n) : "";
}

// typing-safe: cannot type infinite digits, and never exceeds MAX_COUNT
export function limitCountText(s: string) {
  const raw = digitsOnly(s).slice(0, MAX_COUNT_DIGITS);
  if (!raw) return "";
  const n = Number(raw) || 0;
  const clamped = clampInt(n, 0, MAX_COUNT);
  return clamped <= 0 ? "" : String(clamped);
}

// db-safe: always clamp when converting to number
export function clampCountFromText(text: string, min = 0, max = MAX_COUNT) {
  const n = Number(digitsOnly(text || "0")) || 0;
  return clampInt(n, min, max);
}

export function makeEngagementPreset(preset: "few" | "mid" | "lot") {
  let likes = 0;
  if (preset === "few") likes = randInt(0, 80);
  if (preset === "mid") likes = randInt(120, 6_000);
  if (preset === "lot") likes = randInt(30_000, 2_000_000);

  const reposts = clampInt(
    randInt(Math.floor(likes * 0.03), Math.max(0, Math.floor(likes * 0.22))),
    0,
    likes
  );

  const replies = clampInt(
    randInt(Math.floor(reposts * 0.15), Math.max(0, Math.floor(reposts * 0.65))),
    0,
    reposts
  );

  return { likes, reposts, replies };
}