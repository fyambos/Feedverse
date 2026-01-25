export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export function parseCompositeCursor(raw: unknown): { t: string; id: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const parts = s.split("|");
  if (parts.length < 2) return null;

  const t = String(parts[0] ?? "").trim();
  const id = String(parts.slice(1).join("|") ?? "").trim();
  if (!t || !id) return null;

  const dt = new Date(t);
  if (!Number.isFinite(dt.getTime())) return null;

  return { t: dt.toISOString(), id };
}

export function makeCompositeCursor(tIso: string, id: string): string {
  return `${String(tIso)}|${String(id)}`;
}
