import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "feedverse:draft:";

export type DraftKind = "post" | "message";

export type DraftListItem<T = any> = {
  key: string;
  kind: DraftKind | "unknown";
  parts: Record<string, string>;
  value: T;
  savedAt: string | null;
  preview: string;
};

function enc(v: string) {
  return encodeURIComponent(String(v ?? "").trim());
}

export function makeDraftKey(kind: "post" | "message", parts: Record<string, string | null | undefined>) {
  const keys = Object.keys(parts).sort();
  const suffix = keys
    .map((k) => `${enc(k)}=${enc(String(parts[k] ?? ""))}`)
    .join("&");
  return `${PREFIX}${kind}?${suffix}`;
}

function dec(v: string) {
  try {
    return decodeURIComponent(String(v ?? ""));
  } catch {
    return String(v ?? "");
  }
}

export function parseDraftKey(key: string): { kind: DraftKind | "unknown"; parts: Record<string, string> } {
  const k = String(key ?? "");
  if (!k.startsWith(PREFIX)) return { kind: "unknown", parts: {} };

  const rest = k.slice(PREFIX.length);
  const [kindRaw, qs = ""] = rest.split("?", 2);
  const kind = kindRaw === "post" || kindRaw === "message" ? kindRaw : "unknown";
  const parts: Record<string, string> = {};

  const pairs = String(qs).split("&").filter(Boolean);
  for (const p of pairs) {
    const [a, b = ""] = p.split("=", 2);
    const kk = dec(a).trim();
    if (!kk) continue;
    parts[kk] = dec(b);
  }
  return { kind, parts };
}

function coercePreview(kind: DraftKind | "unknown", value: any): string {
  if (!value) return "";
  if (kind === "message") return String(value.text ?? "").trim();
  if (kind === "post") {
    const arr = Array.isArray(value.threadTexts) ? value.threadTexts : [];
    const first = arr.length ? String(arr[0] ?? "") : "";
    return first.trim();
  }
  return String(value.text ?? "").trim();
}

export async function listDraftKeys(kind?: DraftKind): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const all = keys.filter((k) => String(k).startsWith(PREFIX));
  if (!kind) return all;

  const needle = `${PREFIX}${kind}?`;
  return all.filter((k) => String(k).startsWith(needle));
}

export async function listDrafts<T = any>(opts?: {
  kind?: DraftKind;
  limit?: number;
}): Promise<DraftListItem<T>[]> {
  const keys = await listDraftKeys(opts?.kind);
  if (!keys.length) return [];

  const pairs = await AsyncStorage.multiGet(keys);
  const out: DraftListItem<T>[] = [];

  for (const [key, raw] of pairs) {
    if (!raw) continue;
    let value: any = null;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }

    const { kind, parts } = parseDraftKey(key);
    const savedAt = typeof value?.savedAt === "string" ? String(value.savedAt) : null;
    out.push({
      key,
      kind,
      parts,
      value,
      savedAt,
      preview: coercePreview(kind, value),
    });
  }

  out.sort((a, b) => String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
  const limit = typeof opts?.limit === "number" ? Math.max(0, Math.floor(opts.limit)) : undefined;
  return limit ? out.slice(0, limit) : out;
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  const k = String(key ?? "").trim();
  if (!k) return null;

  const raw = await AsyncStorage.getItem(k);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  const k = String(key ?? "").trim();
  if (!k) return;
  await AsyncStorage.setItem(k, JSON.stringify(value));
}

export async function clearDraft(key: string): Promise<void> {
  const k = String(key ?? "").trim();
  if (!k) return;
  await AsyncStorage.removeItem(k);
}
