// mobile/lib/inviteCode.ts

// 8 chars, uppercase A-Z0-9
export function generateInviteCode(): string {
  const raw = Math.random().toString(36).slice(2, 10).toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, "A").slice(0, 8);
}
