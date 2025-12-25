// mobile/lib/rules.ts
import type { Profile } from "@/data/db/schema";

export const MAX_OWNED_PROFILES_PER_USER = 30;

/**
 * Limit is based ONLY on profiles you OWN.
 * Whether the profile is shared/public does NOT matter if you're the owner.
 *
 * Shared/public profiles owned by OTHER users do not count automatically,
 * because ownerUserId !== userId.
 */
export function countOwnedProfilesForUser(
  profiles: Profile[],
  userId: string | null | undefined
) {
  if (!userId) return 0;

  return profiles.filter((p) => String(p.ownerUserId) === String(userId)).length;
}

export function canCreateOwnedProfileForUser(
  profiles: Profile[],
  userId: string | null | undefined
) {
  const ownedCount = countOwnedProfilesForUser(profiles, userId);
  return ownedCount < MAX_OWNED_PROFILES_PER_USER;
}
