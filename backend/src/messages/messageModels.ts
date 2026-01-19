// backend/src/messages/messageModels.ts
export type MessageRow = {
  id: string;
  scenario_id: string;
  conversation_id: string;
  sender_profile_id: string;
  sender_user_id: string | null;
  text: string;
  kind: string;
  image_urls?: string[] | null;
  created_at: Date;
  updated_at: Date | null;
  edited_at: Date | null;
};

export type MessageApi = {
  id: string;
  scenarioId: string;
  conversationId: string;
  senderProfileId: string;
  senderUserId?: string;
  text: string;
  kind: string;
  imageUrls?: string[];
  createdAt: string;
  updatedAt?: string;
  editedAt?: string;
};

function parsePgTextArrayLiteral(input: string): string[] {
  // Very small parser for Postgres text[] literal like: {"a","b"}
  // Handles quoted elements + backslash escapes.
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

function coerceStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null) return undefined;
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
      const parsed = parsePgTextArrayLiteral(trimmed);
      return parsed.length ? parsed : [];
    }
  }
  return undefined;
}

export function mapMessageRowToApi(row: MessageRow): MessageApi {
  const imageUrls = coerceStringArray((row as any).image_urls);
  const senderUserIdRaw = (row as any).sender_user_id;
  const senderUserId = senderUserIdRaw != null ? String(senderUserIdRaw) : undefined;
  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    conversationId: String(row.conversation_id),
    senderProfileId: String(row.sender_profile_id),
    senderUserId,
    text: String(row.text ?? ""),
    kind: String((row as any).kind ?? "text"),
    imageUrls,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at as any).toISOString(),
    updatedAt: row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at as any).toISOString()) : undefined,
    editedAt: row.edited_at ? (row.edited_at instanceof Date ? row.edited_at.toISOString() : new Date(row.edited_at as any).toISOString()) : undefined,
  };
}
