import type { Profile } from "@/data/db/schema";

export const MAX_TOTAL_PLAYERS_PER_SCENARIO = 12;
export const MAX_OWNED_PROFILES_PER_USER = 15;
export const MAX_TOTAL_PROFILES_PER_SCENARIO = 180;

export function countOwnedProfilesForUser(profiles: Profile[], userId: string | null | undefined) {
  if (!userId) return 0;
  return profiles.filter((p) => String(p.ownerUserId) === String(userId)).length;
}

export function canCreateOwnedProfileForUser(profiles: Profile[], userId: string | null | undefined) {
  const ownedCount = countOwnedProfilesForUser(profiles, userId);
  return ownedCount < MAX_OWNED_PROFILES_PER_USER;
}

/**
 * Scenario-level rule:
 * you can switch back to per_owner ONLY if nobody in THIS scenario owns > 15 profiles.
 */
export function canSwitchBackToPerOwnerInScenario(scenarioId: string, allProfiles: Profile[]) {
  const sid = String(scenarioId ?? "");
  if (!sid) return true;

  const counts = new Map<string, number>(); // ownerUserId -> count
  for (const p of allProfiles) {
    if (String(p.scenarioId) !== sid) continue;
    const uid = String(p.ownerUserId ?? "");
    if (!uid) continue;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  for (const n of counts.values()) {
    if (n > MAX_OWNED_PROFILES_PER_USER) return false;
  }
  return true;
}