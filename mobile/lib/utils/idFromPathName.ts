export function scenarioIdFromPathname(pathname: unknown): string {
  const parts = String(pathname ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const scenarioIdx = parts.findIndex((p) => p === "(scenario)" || p === "scenario");
  const candidate =
    scenarioIdx >= 0
      ? parts[scenarioIdx + 1]
      : parts.length > 0
        ? parts[0]
        : "";

  const raw = String(candidate ?? "").trim();
  if (!raw) return "";
  if (raw === "modal") return "";
  if (raw.startsWith("(")) return "";

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function conversationIdFromPathname(pathname: unknown): string {
  const parts = String(pathname ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const idx = parts.findIndex((p) => p === "messages");
  if (idx < 0) return "";
  const candidate = String(parts[idx + 1] ?? "").trim();
  if (!candidate) return "";
  if (candidate === "index") return "";
  if (candidate.startsWith("(")) return "";

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}

export function postIdFromPathname(pathname: unknown): string {
  const parts = String(pathname ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const idx = parts.findIndex((p) => p === "post");
  if (idx < 0) return "";
  const candidate = String(parts[idx + 1] ?? "").trim();
  if (!candidate) return "";
  if (candidate.startsWith("(")) return "";

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}
