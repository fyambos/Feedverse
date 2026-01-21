// mobile/lib/importExport/exportScenarioBundle.ts
import type { DbV5, ScenarioExportScope } from "./exportUiTypes";
import type { ScenarioExportBundleV1 } from "./exportTypes";
import type { CharacterSheet, Like, Post, Profile, Repost, Scenario } from "@/data/db/schema";

export function buildScenarioExportBundleV1(db: DbV5, scenarioId: string, scope: ScenarioExportScope): ScenarioExportBundleV1 {
  const sid = String(scenarioId);
  const scenario = db.scenarios[sid] as Scenario | undefined;
  if (!scenario) throw new Error("Scenario not found");

  const allScenarioPosts = Object.values(db.posts).filter((p) => String(p.scenarioId) === sid);
  const posts: Post[] = scope.includePosts ? allScenarioPosts : [];

  // If exporting posts without exporting *all* profiles, we still need the author profiles
  // so validation/import doesn't end up with dangling authorProfileId references.
  const requiredProfileIds = new Set<string>();
  for (const p of posts) {
    requiredProfileIds.add(String((p as any).authorProfileId ?? ""));
  }

  const allProfiles = Object.values(db.profiles).filter((p) => String(p.scenarioId) === sid);
  const profiles: Profile[] = scope.includeProfiles
    ? allProfiles
    : scope.includePosts
      ? allProfiles.filter((p) => requiredProfileIds.has(String(p.id)))
      : [];

  const includeProfilesSection = scope.includeProfiles || (scope.includePosts && profiles.length > 0);
  const profileIdSet = new Set(profiles.map((p) => String(p.id)));

  const postIdSet = new Set(posts.map((p) => String(p.id)));

  // Important: keep parent/quoted only if referenced post is also included,
  // otherwise drop those links to avoid dangling refs in validation.
  const cleanedPosts: Post[] = posts.map((p) => {
    const parent = (p as any).parentPostId ? String((p as any).parentPostId) : undefined;
    const quoted = (p as any).quotedPostId ? String((p as any).quotedPostId) : undefined;

    return {
      ...p,
      parentPostId: parent && postIdSet.has(parent) ? parent : undefined,
      quotedPostId: quoted && postIdSet.has(quoted) ? quoted : undefined,
    } as any;
  });

  // reposts: only those with profile+post included
  const repostsMap = (db as any).reposts ?? {};
  const allReposts = Object.values(repostsMap) as Repost[];

  const reposts: Repost[] =
    scope.includeReposts && scope.includePosts && scope.includeProfiles
      ? allReposts.filter(
          (r) =>
            String((r as any).scenarioId) === sid &&
            profileIdSet.has(String((r as any).profileId)) &&
            postIdSet.has(String((r as any).postId))
        )
      : [];

  // likes: only those with profile+post included
  const likesMap = (db as any).likes ?? {};
  const allLikes = Object.values(likesMap) as Like[];

  const likes: Like[] =
    scope.includePosts && scope.includeProfiles
      ? allLikes.filter(
          (l) =>
            String((l as any).scenarioId) === sid &&
            profileIdSet.has(String((l as any).profileId)) &&
            postIdSet.has(String((l as any).postId))
        )
      : [];

  // sheets: only those for included profiles
  const sheetsMap = (db as any).sheets ?? {};
  const allSheets = Object.values(sheetsMap) as CharacterSheet[];

  const sheets: CharacterSheet[] =
    scope.includeSheets && scope.includeProfiles
      ? allSheets.filter((s) => profileIdSet.has(String((s as any).profileId)))
      : [];

  const bundle: ScenarioExportBundleV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scenario,
    ...(includeProfilesSection ? { profiles } : {}),
    ...(scope.includePosts ? { posts: cleanedPosts } : {}),
    ...(scope.includeReposts && scope.includePosts && scope.includeProfiles ? { reposts } : {}),
    ...(scope.includePosts && scope.includeProfiles ? { likes } : {}),
    ...(scope.includeSheets && scope.includeProfiles ? { sheets } : {}),
  };

  return bundle;
}