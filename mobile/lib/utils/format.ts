export function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeUrl(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw; // has scheme
  return `https://${raw}`;
}

export function displayUrl(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diff = now - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;

  // For older timestamps, show a compact date.
  // Rule: only omit the year when the date is within the last ~12 months.
  // This avoids locale-specific formats like "Jan 9, 2024" getting visually truncated.
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const includeYear = diff >= ONE_YEAR_MS;

  const date = new Date(t);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  const mon = months[date.getMonth()] ?? "";
  const year = date.getFullYear();

  return includeYear ? `${day} ${mon} ${year}` : `${day} ${mon}`;
}
export function formatDetailTimestamp(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${hh}:${mm} ${dd}/${mo}/${yy}`;
}

export function formatJoined(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

export function formatCount(n: number) {
  const v = Math.max(0, Math.floor((n as any) || 0));

  if (v > 99_000_000_000) return "99B+";
  if (v < 1000) return String(v);

  if (v < 100_000) {
    const k = v / 1000;
    const str = k.toFixed(1).replace(/\.0$/, "");
    return `${str}K`;
  }

  if (v < 1_000_000) return `${Math.floor(v / 1000)}K`;

  if (v < 10_000_000) {
    const m = v / 1_000_000;
    const str = m.toFixed(1).replace(/\.0$/, "");
    return `${str}M`;
  }

  if (v < 1_000_000_000) return `${Math.floor(v / 1_000_000)}M`;

  if (v < 10_000_000_000) {
    const b = v / 1_000_000_000;
    const str = b.toFixed(1).replace(/\.0$/, "");
    return `${str}B`;
  }

  return `${Math.floor(v / 1_000_000_000)}B`;
}


export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePgUniqueConstraintMessage(raw: string): string | null {
    const msg = String(raw ?? "").trim();
    if (!msg) return null;

    const lower = msg.toLowerCase();

    // Common Postgres unique constraint shape:
    // duplicate key value violates unique constraint "users_username_uidx"
    if (lower.includes("duplicate key value") && lower.includes("unique constraint")) {
      if (lower.includes("users_username_uidx")) {
        return "That username is already taken.";
      }

      if (lower.includes("scenarios_invite_code_uidx")) {
        return "That invite code is already in use. Please pick another.";
      }

      return "That value is already in use.";
    }

    // Sometimes the backend bubbles only the constraint name.
    if (lower.includes("users_username_uidx")) return "That username is already taken.";
    if (lower.includes("scenarios_invite_code_uidx")) {
      return "That invite code is already in use. Please pick another.";
    }

    return null;
}

function isProbablyTechnicalErrorMessage(msg: string): boolean {
  const s = String(msg ?? "").trim();
  if (!s) return false;

  // Multi-line or very long messages are almost always internal.
  if (s.includes("\n") || s.length > 160) return true;

  const lower = s.toLowerCase();

  // Database / SQL / ORM / stack traces.
  if (
    lower.includes("sqlstate") ||
    lower.includes("postgres") ||
    lower.includes("pg_") ||
    lower.includes("query failed") ||
    lower.includes("syntax error") ||
    lower.includes("violates") ||
    lower.includes("constraint") ||
    lower.includes("duplicate key value") ||
    lower.includes("relation ") ||
    lower.includes("column ") ||
    lower.includes("at character") ||
    lower.includes("sequelize") ||
    lower.includes("prisma") ||
    lower.includes("knex") ||
    lower.includes("typeorm") ||
    lower.includes("queryfailederror") ||
    lower.includes("stack")
  ) {
    return true;
  }

  // Low-signal generic runtime prefixes.
  if (lower.startsWith("error:")) return true;
  if (lower.startsWith("typeerror:")) return true;

  // Looks like an internal identifier.
  if (/[a-z0-9_]{8,}_(uidx|idx|pkey)\b/i.test(s)) return true;

  return false;
}

/**
 * Best-effort extraction of a user-facing error message.
 * This is intentionally NOT limited to network errors (name kept for backward-compat elsewhere).
 */
export function formatErrorMessage(e: unknown, fallback: string) {
  if (e == null) return fallback;

  if (typeof e === "string") {
    const normalized = normalizePgUniqueConstraintMessage(e);
    if (normalized) return normalized;

    const raw = String(e).trim();
    if (!raw) return fallback;

     // Rate limiting should be shown as a friendly UX hint.
    if (/too\s+many\s+requests/i.test(raw)) {
      return "Slow down — too many requests. Try again in a few seconds.";
    }
    if (isProbablyTechnicalErrorMessage(raw)) return fallback;
    return raw;
  }

  if (typeof e === "object") {
    const anyE = e as any;

    const status =
      typeof anyE?.status === "number"
        ? anyE.status
        : typeof anyE?.response?.status === "number"
          ? anyE.response.status
          : null;
    if (status === 429) {
      return "Slow down — too many requests. Try again in a few seconds.";
    }

    // Common shapes we use in the app
    const candidateStrings = [
      anyE?.message,
      anyE?.error,
      anyE?.details,
      anyE?.response?.data?.error,
      anyE?.response?.data?.message,
    ].filter((v) => typeof v === "string") as string[];

    for (const s of candidateStrings) {
      const trimmed = String(s).trim();
      if (!trimmed) continue;

      const normalized = normalizePgUniqueConstraintMessage(trimmed);
      if (normalized) return normalized;

      if (/too\s+many\s+requests/i.test(trimmed)) {
        return "Slow down — too many requests. Try again in a few seconds.";
      }
      if (isProbablyTechnicalErrorMessage(trimmed)) return fallback;
      return trimmed;
    }
  }

  return fallback;
}

