export function formatNetworkError(e: unknown, fallback: string) {
  if (e == null) return fallback;
  if (typeof e === "string") return e || fallback;
  if (typeof e === "object") {
    const anyE = e as any;
    const msg = anyE?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}
