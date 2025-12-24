import type { Profile } from "@/data/db/schema";

/* -------------------------------------------------------------------------- */
/* Profile permissions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A profile is editable if:
 * - you own it
 * - it is public
 * - OR it is the currently selected profile
 */
export function canEditProfile({
  profile,
  userId,
  selectedProfileId,
}: {
  profile: Profile | null | undefined;
  userId: string | null | undefined;
  selectedProfileId: string | null | undefined;
}) {
  if (!profile || !userId) return false;

  const isOwner = profile.ownerUserId === userId;
  const isPublic = !!profile.isPublic;
  const isSelected = !!selectedProfileId && String(profile.id) === String(selectedProfileId);

  return isOwner || isPublic || isSelected;
}

/* -------------------------------------------------------------------------- */
/* Post permissions                                                           */
/* -------------------------------------------------------------------------- */


/**
 * A post is editable if:
 * - you own the author profile
 * - OR the author profile is public
 */
export function canEditPost({
  authorProfile,
  userId,
}: {
  authorProfile: Profile | null | undefined;
  userId: string | null | undefined;
}) {
  if (!authorProfile || !userId) return false;

  return (
    authorProfile.ownerUserId === userId ||
    !!authorProfile.isPublic
  );
}
