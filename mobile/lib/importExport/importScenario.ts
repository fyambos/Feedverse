// mobile/lib/importExport/importScenario.ts
import type { DbV5, Scenario, Profile, Post, Repost, CharacterSheet, ScenarioTag, GlobalTag, Like } from "@/data/db/schema";
import { MAX_OWNED_PROFILES_PER_USER, MAX_TOTAL_PROFILES_PER_SCENARIO } from "@/lib/scenario/rules";
import { generateInviteCode } from "@/lib/invites/inviteCode";
import { validateScenarioExportBundleV1, isValidHandleAlnum } from "./validateScenarioExport";
import type { ScenarioExportBundleV1 } from "./exportTypes";
import { buildGlobalTagFromKey } from "@/lib/content/tags";

type ImportOptions = {
  currentUserId: string;
  db: DbV5;

  includeProfiles: boolean;
  includePosts: boolean;
  includeReposts: boolean;
  includeSheets: boolean;

  forceNewScenarioId?: boolean;
  maxOwnedProfiles?: number;
};

type ImportResult =
  | {
      ok: true;
      nextDb: DbV5;
      imported: {
        scenarioId: string;
        profiles: number;
        posts: number;
        reposts: number;
        sheets: number;
        renamedHandles: Array<{ from: string; to: string }>;
        skipped: {
          profilesDueToLimit: number;
          postsDueToMissingProfile: number;
          repostsDueToMissingProfileOrPost: number;
          sheetsDueToMissingProfile: number;
        };
      };
    }
  | { ok: false; error: string };

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeHandle(h: string) {
  return String(h ?? "").trim(); // your validator guarantees alnum (no @)
}

function countOwnedInScenario(db: DbV5, scenarioId: string, userId: string) {
  const sid = String(scenarioId ?? "");
  const uid = String(userId ?? "");
  if (!sid || !uid) return 0;

  return Object.values(db.profiles).filter(
    (p) => String(p.scenarioId) === sid && String(p.ownerUserId) === uid
  ).length;
}

function countTotalInScenario(db: DbV5, scenarioId: string) {
  const sid = String(scenarioId ?? "");
  if (!sid) return 0;

  return Object.values(db.profiles).filter((p) => String(p.scenarioId) === sid).length;
}

function makeUniqueHandle(baseHandle: string, takenLower: Set<string>, maxLen = 32) {
  const base = normalizeHandle(baseHandle);
  const safeBase = isValidHandleAlnum(base, maxLen) ? base : "user";

  const lowerBase = safeBase.toLowerCase();
  if (!takenLower.has(lowerBase)) {
    takenLower.add(lowerBase);
    return { handle: safeBase, renamedFrom: undefined as string | undefined };
  }

  let n = 1;
  while (true) {
    const suffix = String(n);
    const cut = Math.max(1, maxLen - suffix.length);
    const candidate = safeBase.slice(0, cut) + suffix; // hyunjin1 hyunjin2 ...
    const lower = candidate.toLowerCase();
    if (!takenLower.has(lower)) {
      takenLower.add(lower);
      return { handle: candidate, renamedFrom: safeBase };
    }
    n++;
  }
}

function mergeScenarioTagsIntoGlobalRegistry(prevTags: Record<string, GlobalTag>, scenarioTags?: ScenarioTag[]) {
  const nextTags = { ...(prevTags ?? {}) };

  const normalizedScenarioTags: ScenarioTag[] = [];

  for (const t of scenarioTags ?? []) {
    const key = String((t as any).key ?? "").toLowerCase();
    if (!key) continue;

    // ensure global registry has it
    if (!nextTags[key]) {
      const built = buildGlobalTagFromKey(key);
      if (!built) continue;

      nextTags[key] = {
        key: built.key,
        name: built.name,
        color: built.color,
      };
    }

    normalizedScenarioTags.push({
      id: String((t as any).id ?? `t_${key}`),
      key,
      name: nextTags[key].name,
      color: nextTags[key].color,
    });
  }

  // de-dupe by key
  const seen = new Set<string>();
  const deduped = normalizedScenarioTags.filter((tg) => {
    const k = String(tg.key);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { nextTags, scenarioTags: deduped };
}

export function importScenarioFromJson(raw: any, opts: ImportOptions): ImportResult {
  const { db, currentUserId } = opts;
  if (!currentUserId) return { ok: false, error: "Missing currentUserId" };

  // 1) validate file
  const v = validateScenarioExportBundleV1(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const bundle: ScenarioExportBundleV1 = v.value;

  // 2) choose scenario id
  const incomingScenario = bundle.scenario;
  const forceNew = opts.forceNewScenarioId ?? false; // to force new scenario
  const incomingId = String(incomingScenario.id); // will be ignored if forceNew
  const existingScenario = !forceNew ? (db.scenarios[incomingId] ?? null) : null; // to merge into existing scenario (with the scenario id in the json file) if not forcing new

  const targetScenarioId = forceNew ? genId("sc") : existingScenario ? incomingId : incomingId;

  // 3) merge tags registry + normalize scenario tags
  const { nextTags, scenarioTags } = mergeScenarioTagsIntoGlobalRegistry(db.tags ?? {}, incomingScenario.tags);

  // 4) create scenario record
  // when importing into an existing scenario, do NOT overwrite its core metadata.
  // we only ensure the current user is in playerIds, and we normalize/merge tags.
  // when creating a new scenario, we take metadata from the bundle but set owner to current user.
  const scenarioToInsert: Scenario = existingScenario
    ? {
        ...existingScenario,
        playerIds: Array.from(
          new Set([
            ...(existingScenario.playerIds ?? []).map(String),
            String(currentUserId),
            ...(incomingScenario.playerIds ?? []).map(String),
          ])
        ),
        tags: scenarioTags,
        updatedAt: nowIso(),
      }
    : {
        ...incomingScenario,
        id: targetScenarioId,
        ownerUserId: String(currentUserId),
        playerIds: Array.from(new Set([String(currentUserId), ...(incomingScenario.playerIds ?? []).map(String)])),
        tags: scenarioTags,
        inviteCode: generateInviteCode(),
        // Treat an import as a newly created local scenario so it appears at the top
        // of the scenario list (which sorts by createdAt).
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

  // 5) compute profile slot remaining (depends on scenario setting)
  type ProfileLimitMode = "per_owner" | "per_scenario";
  const limitSource = (existingScenario ?? incomingScenario) as any;
  const profileLimitMode: ProfileLimitMode =
    limitSource?.settings?.profileLimitMode === "per_scenario" ? "per_scenario" : "per_owner";

  let remaining = 0;

  if (profileLimitMode === "per_scenario") {
    const alreadyTotal = countTotalInScenario(db, targetScenarioId);
    remaining = Math.max(0, MAX_TOTAL_PROFILES_PER_SCENARIO - alreadyTotal);
  } else {
    const maxOwned = opts.maxOwnedProfiles ?? MAX_OWNED_PROFILES_PER_USER;
    const alreadyOwned = countOwnedInScenario(db, targetScenarioId, currentUserId);
    remaining = Math.max(0, maxOwned - alreadyOwned);
  }

  // 6) handles taken in that scenario
  const takenHandlesLower = new Set<string>();
  for (const p of Object.values(db.profiles)) {
    if (String(p.scenarioId) === String(targetScenarioId)) {
      takenHandlesLower.add(String(p.handle).toLowerCase());
    }
  }

  const renamedHandles: Array<{ from: string; to: string }> = [];

  // 7) import profiles
  const incomingProfiles = opts.includeProfiles ? (bundle.profiles ?? []) : [];
  const profilesToImport = incomingProfiles.slice(0, remaining);
  const skippedProfilesDueToLimit = Math.max(0, incomingProfiles.length - profilesToImport.length);

  const profileIdMap = new Map<string, string>();
  const importedProfiles: Profile[] = [];
  const legacyLikedPostIdsByOldProfileId = new Map<string, string[]>();

  for (const p of profilesToImport) {
    const pAny = p as any;
    const oldProfileId = String(pAny?.id ?? "");

    const newId = genId("pr");
    profileIdMap.set(oldProfileId, newId);

    // Back-compat: older exports may still have Profile.likedPostIds
    const legacyLikedPostIds = Array.isArray(pAny?.likedPostIds) ? pAny.likedPostIds.map(String).filter(Boolean) : [];
    if (legacyLikedPostIds.length > 0) {
      legacyLikedPostIdsByOldProfileId.set(oldProfileId, legacyLikedPostIds);
    }

    // Strip legacy field so it doesn't get persisted back onto profiles
    const { likedPostIds: _ignoredLikedPostIds, ...pWithoutLegacyLikes } = pAny ?? {};

    const baseHandle = normalizeHandle(p.handle);
    const { handle: uniqueHandle, renamedFrom } = makeUniqueHandle(baseHandle, takenHandlesLower, 32);

    if (uniqueHandle !== baseHandle) {
      renamedHandles.push({ from: baseHandle, to: uniqueHandle });
    } else if (renamedFrom && renamedFrom !== uniqueHandle) {
      renamedHandles.push({ from: renamedFrom, to: uniqueHandle });
    }

    importedProfiles.push({
      ...(pWithoutLegacyLikes as Profile),
      id: newId,
      scenarioId: targetScenarioId,
      ownerUserId: String(currentUserId), // ignore export owner
      handle: uniqueHandle,
      createdAt: p.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
  }

  // 8) import posts (only if profiles included)
  const incomingPosts = opts.includePosts && opts.includeProfiles ? (bundle.posts ?? []) : [];
  const postIdMap = new Map<string, string>();
  const importedPosts: Post[] = [];
  let postsSkippedDueToMissingProfile = 0;

  for (const post of incomingPosts) {
    const newAuthor = profileIdMap.get(String(post.authorProfileId));
    if (!newAuthor) {
      postsSkippedDueToMissingProfile++;
      continue;
    }

    const newPostId = genId("po");
    postIdMap.set(String(post.id), newPostId);

    importedPosts.push({
      ...post,
      id: newPostId,
      scenarioId: targetScenarioId,
      authorProfileId: newAuthor,
      parentPostId: post.parentPostId ? String(post.parentPostId) : undefined, // remap later
      quotedPostId: post.quotedPostId ? String(post.quotedPostId) : undefined, // remap later
      createdAt: post.createdAt || nowIso(),
      insertedAt: post.insertedAt || nowIso(),
      updatedAt: nowIso(),
    });
  }

  // remap parent/quoted to new post ids (drop if missing)
  for (let i = 0; i < importedPosts.length; i++) {
    const p = importedPosts[i];
    const newParent = p.parentPostId ? postIdMap.get(String(p.parentPostId)) : undefined;
    const newQuoted = p.quotedPostId ? postIdMap.get(String(p.quotedPostId)) : undefined;

    importedPosts[i] = {
      ...p,
      parentPostId: newParent,
      quotedPostId: newQuoted,
    };
  }

  // 8.5) import likes (legacy) -> DbV5.likes
  // Likes only make sense if we imported posts and profiles, since we remap ids.
  const importedLikes: Like[] = [];
  if (opts.includeProfiles && opts.includePosts) {
    const seenLikeKeys = new Set<string>();

    // Preferred: v1 bundles that include likes explicitly
    const incomingLikes = Array.isArray((bundle as any)?.likes) ? ((bundle as any).likes as any[]) : [];
    for (const l of incomingLikes) {
      const oldProfileId = String((l as any)?.profileId ?? "");
      const oldPostId = String((l as any)?.postId ?? "");
      if (!oldProfileId || !oldPostId) continue;

      const newProfileId = profileIdMap.get(oldProfileId);
      const newPostId = postIdMap.get(oldPostId);
      if (!newProfileId || !newPostId) continue;

      const key = `${targetScenarioId}|${newProfileId}|${newPostId}`;
      if (seenLikeKeys.has(key)) continue;
      seenLikeKeys.add(key);

      const createdAt = typeof (l as any)?.createdAt === "string" ? String((l as any).createdAt) : nowIso();
      importedLikes.push({
        id: key,
        scenarioId: targetScenarioId,
        profileId: newProfileId,
        postId: newPostId,
        createdAt,
      });
    }

    for (const [oldProfileId, oldLikedPostIds] of legacyLikedPostIdsByOldProfileId.entries()) {
      const newProfileId = profileIdMap.get(String(oldProfileId));
      if (!newProfileId) continue;

      for (const oldPostId of oldLikedPostIds) {
        const newPostId = postIdMap.get(String(oldPostId));
        if (!newPostId) continue;

        const key = `${targetScenarioId}|${newProfileId}|${newPostId}`;
        if (seenLikeKeys.has(key)) continue;
        seenLikeKeys.add(key);

        importedLikes.push({
          id: key,
          scenarioId: targetScenarioId,
          profileId: newProfileId,
          postId: newPostId,
          createdAt: nowIso(),
        });
      }
    }
  }

  // 9) import reposts (your db uses key = `${profileId}|${postId}`)
  const incomingReposts =
    opts.includeReposts && opts.includePosts && opts.includeProfiles ? (bundle.reposts ?? []) : [];
  const importedReposts: Repost[] = [];
  let repostsSkippedDueToMissing = 0;

  for (const r of incomingReposts) {
    const newProfile = profileIdMap.get(String(r.profileId));
    const newPost = postIdMap.get(String(r.postId));

    if (!newProfile || !newPost) {
      repostsSkippedDueToMissing++;
      continue;
    }

    const key = `${newProfile}|${newPost}`;

    importedReposts.push({
      id: key,
      scenarioId: targetScenarioId,
      profileId: newProfile,
      postId: newPost,
      createdAt: r.createdAt || nowIso(),
    });
  }

  // 10) import sheets
  const incomingSheets = opts.includeSheets && opts.includeProfiles ? (bundle.sheets ?? []) : [];
  const importedSheets: CharacterSheet[] = [];
  let sheetsSkippedDueToMissingProfile = 0;

  for (const s of incomingSheets) {
    const newPid = profileIdMap.get(String(s.profileId));
    if (!newPid) {
      sheetsSkippedDueToMissingProfile++;
      continue;
    }
    importedSheets.push({
      ...s,
      profileId: newPid,
      updatedAt: nowIso(),
    });
  }

  // 10.5) choose a default selected profile (only if it's actually owned by the current user)
  const hasSelectionAlready = Boolean((db.selectedProfileByScenario ?? ({} as any))[targetScenarioId]);
  const firstOwnedImportedProfile = importedProfiles.find(
    (p) => String((p as any)?.ownerUserId ?? "").trim() === String(opts.currentUserId ?? "").trim()
  );
  const defaultSelectedProfileId =
    !hasSelectionAlready && firstOwnedImportedProfile?.id ? String(firstOwnedImportedProfile.id) : null;

  // 11) build next db (merge)
  const nextDb: DbV5 = {
    ...db,
    version: 5,
    tags: nextTags,
    scenarios: {
      ...db.scenarios,
      [targetScenarioId]: scenarioToInsert,
    },
    profiles: {
      ...db.profiles,
      ...Object.fromEntries(importedProfiles.map((p) => [String(p.id), p])),
    },
    posts: {
      ...db.posts,
      ...Object.fromEntries(importedPosts.map((p) => [String(p.id), p])),
    },
    reposts: {
      ...(db.reposts ?? {}),
      ...Object.fromEntries(importedReposts.map((r) => [String(r.id), r])),
    },
    likes: {
      ...(db.likes ?? {}),
      ...Object.fromEntries(importedLikes.map((l) => [String(l.id), l])),
    },
    sheets: {
      ...(db.sheets ?? {}),
      ...Object.fromEntries(importedSheets.map((s) => [String(s.profileId), s])),
    },
    selectedProfileByScenario: {
      ...(db.selectedProfileByScenario ?? {}),
      ...(defaultSelectedProfileId ? { [targetScenarioId]: defaultSelectedProfileId } : {}),
    },
  };

  return {
    ok: true,
    nextDb,
    imported: {
      scenarioId: targetScenarioId,
      profiles: importedProfiles.length,
      posts: importedPosts.length,
      reposts: importedReposts.length,
      sheets: importedSheets.length,
      renamedHandles,
      skipped: {
        profilesDueToLimit: skippedProfilesDueToLimit,
        postsDueToMissingProfile: postsSkippedDueToMissingProfile,
        repostsDueToMissingProfileOrPost: repostsSkippedDueToMissing,
        sheetsDueToMissingProfile: sheetsSkippedDueToMissingProfile,
      },
    },
  };
}