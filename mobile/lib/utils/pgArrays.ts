export function parsePgTextArrayLiteral(input: string): string[] {
  const s = String(input ?? "").trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return [];
  const body = s.slice(1, -1);
  if (!body) return [];

  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let escape = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      const v = cur.trim();
      if (v && v.toUpperCase() !== "NULL") out.push(v);
      cur = "";
      continue;
    }
    cur += ch;
  }

  const last = cur.trim();
  if (last && last.toUpperCase() !== "NULL") out.push(last);
  return out.map((x) => String(x)).filter(Boolean);
}

export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();

    // JSON array?
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        // ignore
      }
    }

    // Postgres array literal?
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return parsePgTextArrayLiteral(trimmed);
    }
  }

  return [];
}
