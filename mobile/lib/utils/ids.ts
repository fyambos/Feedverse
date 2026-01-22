// mobile/lib/ids.ts

// NOTE: We intentionally avoid `crypto.getRandomValues()` here because
// Hermes/Expo environments may not have WebCrypto available by default.
// This is not cryptographically secure; it's for local/offline identifiers.
export function makeLocalUuid(): string {
  let time = Date.now();
  let perf = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() * 1000 : 0;

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let r = Math.random() * 16;
    if (time > 0) {
      r = (time + r) % 16;
      time = Math.floor(time / 16);
    } else {
      r = (perf + r) % 16;
      perf = Math.floor(perf / 16);
    }

    const v = c === "x" ? (r | 0) : ((r | 0) & 0x3) | 0x8;
    return v.toString(16);
  });
}
