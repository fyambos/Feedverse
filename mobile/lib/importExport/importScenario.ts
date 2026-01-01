// mobile/lib/importExport/importScenario.ts
import type { DbV5, Scenario, Profile, Post, Repost, CharacterSheet, ScenarioTag, GlobalTag } from "@/data/db/schema";
import { MAX_OWNED_PROFILES_PER_USER } from "@/lib/rules";
import { validateScenarioExportBundleV1, isValidHandleAlnum } from "./validateScenarioExport";
import type { ScenarioExportBundleV1 } from "./exportTypes";
import { buildGlobalTagFromKey } from "@/lib/tags";

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

function countOwnedInDb(db: DbV5, userId: string) {
  return Object.values(db.profiles).filter((p) => String(p.ownerUserId) === String(userId)).length;
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
  const forceNew = opts.forceNewScenarioId ?? true;
  const targetScenarioId =
    forceNew || db.scenarios[String(incomingScenario.id)]
      ? genId("sc")
      : String(incomingScenario.id);

  // 3) merge tags registry + normalize scenario tags
  const { nextTags, scenarioTags } = mergeScenarioTagsIntoGlobalRegistry(db.tags ?? {}, incomingScenario.tags);

  // 4) create scenario record
  const scenarioToInsert: Scenario = {
    ...incomingScenario,
    id: targetScenarioId,
    ownerUserId: String(currentUserId),
    playerIds: Array.from(new Set([String(currentUserId), ...(incomingScenario.playerIds ?? []).map(String)])),
    tags: scenarioTags,
    createdAt: incomingScenario.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  // 5) compute owned profile slot remaining
  const maxOwned = opts.maxOwnedProfiles ?? MAX_OWNED_PROFILES_PER_USER;
  const alreadyOwned = countOwnedInDb(db, currentUserId);
  const remaining = Math.max(0, maxOwned - alreadyOwned);

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

  for (const p of profilesToImport) {
    const newId = genId("pr");
    profileIdMap.set(String(p.id), newId);

    const baseHandle = normalizeHandle(p.handle);
    const { handle: uniqueHandle, renamedFrom } = makeUniqueHandle(baseHandle, takenHandlesLower, 32);

    if (uniqueHandle !== baseHandle) {
      renamedHandles.push({ from: baseHandle, to: uniqueHandle });
    } else if (renamedFrom && renamedFrom !== uniqueHandle) {
      renamedHandles.push({ from: renamedFrom, to: uniqueHandle });
    }

    importedProfiles.push({
      ...p,
      id: newId,
      scenarioId: targetScenarioId,
      ownerUserId: String(currentUserId), // ignore export owner
      handle: uniqueHandle,
      createdAt: p.createdAt || nowIso(),
      updatedAt: nowIso(),
      // likedPostIds: optional — safe to keep, but they won't match imported post ids anyway
      likedPostIds: [], // <- recommended to clear on import
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
    sheets: {
      ...(db.sheets ?? {}),
      ...Object.fromEntries(importedSheets.map((s) => [String(s.profileId), s])),
    },
    selectedProfileByScenario: {
      ...(db.selectedProfileByScenario ?? {}),
      ...(importedProfiles.length > 0 ? { [targetScenarioId]: String(importedProfiles[0].id) } : {}),
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