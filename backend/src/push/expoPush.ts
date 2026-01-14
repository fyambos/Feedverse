type ExpoPushMessage = {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
};

function isProbablyExpoPushToken(token: string): boolean {
  const t = String(token ?? "").trim();
  // Expo historically used ExponentPushToken[...] and now uses ExpoPushToken[...]
  return /^ExponentPushToken\[.+\]$/.test(t) || /^ExpoPushToken\[.+\]$/.test(t);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const fetchAny: any = (globalThis as any).fetch;
  if (typeof fetchAny !== "function") {
    console.warn("sendExpoPush: global fetch not available; skipping");
    return;
  }

  const valid = (messages ?? [])
    .map((m) => ({
      ...m,
      to: String(m?.to ?? "").trim(),
      title: String(m?.title ?? "").trim(),
      body: m?.body == null ? undefined : String(m.body),
    }))
    .filter((m) => m.to && m.title && isProbablyExpoPushToken(m.to));

  if (valid.length === 0) return;

  // Expo recommends max 100 messages per request.
  const batches = chunk(valid, 100);
  for (const batch of batches) {
    try {
      const res = await fetchAny("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      // Best-effort logging; avoid throwing.
      if (!res?.ok) {
        let text = "";
        try {
          text = await res.text();
        } catch {}
        console.warn("Expo push send failed", res?.status, text || "");
      }
    } catch (e: any) {
      console.warn("Expo push send error", e?.message ?? e);
    }
  }
}
