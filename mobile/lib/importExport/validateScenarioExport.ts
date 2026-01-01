// mobile/lib/importExport/validateScenarioExport.ts
import type {
  Scenario,
  Profile,
  Post,
  Repost,
  CharacterSheet,
} from "@/data/db/schema";
import type { ScenarioExportBundleV1 } from "./exportTypes";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
export type ValidateResult<T> = Ok<T> | Err;

const DEFAULT_LIMITS = {
  maxJsonBytes: 2_000_000, // 2MB (tune)
  maxProfiles: 500,
  maxPosts: 50_000,
  maxReposts: 50_000,
  maxSheets: 500,

  // text limits (tune)
  maxScenarioName: 80,
  maxScenarioDescription: 3_000,
  maxProfileDisplayName: 80,
  maxProfileBio: 2_000,
  maxProfileHandle: 32,
  maxPostText: 10_000,
  maxUrl: 2_048,
};

function isObj(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function isString(x: any): x is string {
  return typeof x === "string";
}

function isOptionalString(x: any): x is string | undefined {
  return x === undefined || typeof x === "string";
}

function isOptionalNumber(x: any): x is number | undefined {
  return x === undefined || typeof x === "number";
}

function isStringArray(x: any): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function tooLong(s: string, max: number) {
  return s.length > max;
}

function isUrlishOrEmpty(x: any) {
  // you can make this stricter later
  if (x === undefined) return true;
  if (typeof x !== "string") return false;
  return x.length <= DEFAULT_LIMITS.maxUrl;
}

function isIsoish(s: string) {
  // "good enough" check to avoid non-strings; you can tighten if you want
  return typeof s === "string" && s.length >= 10 && s.length <= 40;
}

/**
 * handles: letters+numbers only, no symbols, no '@'
 * (as you said: mocks & app only store alnum)
 */
export function isValidHandleAlnum(handle: string, maxLen = DEFAULT_LIMITS.maxProfileHandle) {
  if (!handle) return false;
  if (handle.length > maxLen) return false;
  return /^[a-zA-Z0-9]+$/.test(handle);
}

function validateScenario(s: any): ValidateResult<Scenario> {
  if (!isObj(s)) return { ok: false, error: "scenario must be an object" };

  const requiredStr = ["id", "name", "cover", "inviteCode", "ownerUserId", "createdAt", "mode"];
  for (const k of requiredStr) {
    if (!isString(s[k])) return { ok: false, error: `scenario.${k} must be a string` };
  }

  if (!Array.isArray(s.playerIds) || !s.playerIds.every((x: any) => typeof x === "string")) {
    return { ok: false, error: "scenario.playerIds must be string[]" };
  }

  if (tooLong(s.name, DEFAULT_LIMITS.maxScenarioName)) {
    return { ok: false, error: `scenario.name too long (max ${DEFAULT_LIMITS.maxScenarioName})` };
  }
  if (s.description !== undefined) {
    if (!isString(s.description)) return { ok: false, error: "scenario.description must be string" };
    if (tooLong(s.description, DEFAULT_LIMITS.maxScenarioDescription)) {
      return { ok: false, error: `scenario.description too long (max ${DEFAULT_LIMITS.maxScenarioDescription})` };
    }
  }

  if (s.mode !== "story" && s.mode !== "campaign") {
    return { ok: false, error: "scenario.mode must be 'story' or 'campaign'" };
  }

  if (!isIsoish(s.createdAt)) return { ok: false, error: "scenario.createdAt must look like ISO string" };
  if (s.updatedAt !== undefined && !isIsoish(String(s.updatedAt))) {
    return { ok: false, error: "scenario.updatedAt must look like ISO string" };
  }

  // optional tags
  if (s.tags !== undefined) {
    if (!Array.isArray(s.tags)) return { ok: false, error: "scenario.tags must be array" };
    for (const [i, t] of s.tags.entries()) {
      if (!isObj(t)) return { ok: false, error: `scenario.tags[${i}] must be object` };
      if (!isString(t.id) || !isString(t.key) || !isString(t.name) || !isString(t.color)) {
        return { ok: false, error: `scenario.tags[${i}] fields invalid` };
      }
    }
  }

  if (s.gmUserIds !== undefined) {
    if (!isStringArray(s.gmUserIds)) return { ok: false, error: "scenario.gmUserIds must be string[]" };
  }

  return { ok: true, value: s as Scenario };
}

function validateProfiles(arr: any, scenarioId: string): ValidateResult<Profile[] | undefined> {
  if (arr === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(arr)) return { ok: false, error: "profiles must be an array" };
  if (arr.length > DEFAULT_LIMITS.maxProfiles) {
    return { ok: false, error: `too many profiles (max ${DEFAULT_LIMITS.maxProfiles})` };
  }

  for (const [i, p] of arr.entries()) {
    if (!isObj(p)) return { ok: false, error: `profiles[${i}] must be object` };

    const requiredStr = ["id", "scenarioId", "ownerUserId", "displayName", "handle", "avatarUrl", "createdAt"];
    for (const k of requiredStr) {
      if (!isString(p[k])) return { ok: false, error: `profiles[${i}].${k} must be string` };
    }

    if (String(p.scenarioId) !== String(scenarioId)) {
      return { ok: false, error: `profiles[${i}].scenarioId mismatch` };
    }

    if (tooLong(p.displayName, DEFAULT_LIMITS.maxProfileDisplayName)) {
      return { ok: false, error: `profiles[${i}].displayName too long` };
    }

    if (!isValidHandleAlnum(String(p.handle))) {
      return { ok: false, error: `profiles[${i}].handle invalid (must be alnum, no '@')` };
    }

    // optional strings
    const optionalStrings = ["headerUrl", "bio", "joinedDate", "location", "link", "updatedAt"];
    for (const k of optionalStrings) {
      if (!isOptionalString(p[k])) return { ok: false, error: `profiles[${i}].${k} must be string` };
      if ((k === "headerUrl" || k === "link") && !isUrlishOrEmpty(p[k])) {
        return { ok: false, error: `profiles[${i}].${k} too long` };
      }
      if (k === "bio" && p.bio && tooLong(p.bio, DEFAULT_LIMITS.maxProfileBio)) {
        return { ok: false, error: `profiles[${i}].bio too long` };
      }
    }

    if (p.isPrivate !== undefined && typeof p.isPrivate !== "boolean") {
      return { ok: false, error: `profiles[${i}].isPrivate must be boolean` };
    }

    if (p.likedPostIds !== undefined) {
      if (!isStringArray(p.likedPostIds)) return { ok: false, error: `profiles[${i}].likedPostIds must be string[]` };
    }
  }

  return { ok: true, value: arr as Profile[] };
}

function validatePosts(arr: any, scenarioId: string): ValidateResult<Post[] | undefined> {
  if (arr === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(arr)) return { ok: false, error: "posts must be an array" };
  if (arr.length > DEFAULT_LIMITS.maxPosts) {
    return { ok: false, error: `too many posts (max ${DEFAULT_LIMITS.maxPosts})` };
  }

  for (const [i, p] of arr.entries()) {
    if (!isObj(p)) return { ok: false, error: `posts[${i}] must be object` };

    const requiredStr = ["id", "scenarioId", "authorProfileId", "text", "createdAt", "insertedAt"];
    for (const k of requiredStr) {
      if (!isString(p[k])) return { ok: false, error: `posts[${i}].${k} must be string` };
    }

    if (String(p.scenarioId) !== String(scenarioId)) {
      return { ok: false, error: `posts[${i}].scenarioId mismatch` };
    }

    if (tooLong(p.text, DEFAULT_LIMITS.maxPostText)) {
      return { ok: false, error: `posts[${i}].text too long` };
    }

    if (p.imageUrls !== undefined) {
      if (!Array.isArray(p.imageUrls) || !p.imageUrls.every((u: any) => typeof u === "string")) {
        return { ok: false, error: `posts[${i}].imageUrls must be string[]` };
      }
      for (const u of p.imageUrls) {
        if (u.length > DEFAULT_LIMITS.maxUrl) return { ok: false, error: `posts[${i}].imageUrls contains too long url` };
      }
    }

    if (p.parentPostId !== undefined && !isString(p.parentPostId)) {
      return { ok: false, error: `posts[${i}].parentPostId must be string` };
    }
    if (p.quotedPostId !== undefined && !isString(p.quotedPostId)) {
      return { ok: false, error: `posts[${i}].quotedPostId must be string` };
    }

    if (p.postType !== undefined) {
      const ok =
        p.postType === "rp" ||
        p.postType === "roll" ||
        p.postType === "log" ||
        p.postType === "quest" ||
        p.postType === "combat" ||
        p.postType === "gm";
      if (!ok) return { ok: false, error: `posts[${i}].postType invalid` };
    }

    if (p.isPinned !== undefined && typeof p.isPinned !== "boolean") {
      return { ok: false, error: `posts[${i}].isPinned must be boolean` };
    }
    if (p.pinOrder !== undefined && typeof p.pinOrder !== "number") {
      return { ok: false, error: `posts[${i}].pinOrder must be number` };
    }

    // counts (optional)
    const optionalNumbers = ["replyCount", "repostCount", "likeCount"];
    for (const k of optionalNumbers) {
      if (!isOptionalNumber(p[k])) return { ok: false, error: `posts[${i}].${k} must be number` };
      if (typeof p[k] === "number" && p[k] < 0) return { ok: false, error: `posts[${i}].${k} must be >= 0` };
    }
  }

  return { ok: true, value: arr as Post[] };
}

function validateReposts(arr: any, scenarioId: string): ValidateResult<Repost[] | undefined> {
  if (arr === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(arr)) return { ok: false, error: "reposts must be an array" };
  if (arr.length > DEFAULT_LIMITS.maxReposts) {
    return { ok: false, error: `too many reposts (max ${DEFAULT_LIMITS.maxReposts})` };
  }

  for (const [i, r] of arr.entries()) {
    if (!isObj(r)) return { ok: false, error: `reposts[${i}] must be object` };
    const requiredStr = ["id", "scenarioId", "profileId", "postId", "createdAt"];
    for (const k of requiredStr) {
      if (!isString(r[k])) return { ok: false, error: `reposts[${i}].${k} must be string` };
    }
    if (String(r.scenarioId) !== String(scenarioId)) {
      return { ok: false, error: `reposts[${i}].scenarioId mismatch` };
    }
  }

  return { ok: true, value: arr as Repost[] };
}

function validateSheets(arr: any, scenarioId: string): ValidateResult<CharacterSheet[] | undefined> {
  if (arr === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(arr)) return { ok: false, error: "sheets must be an array" };
  if (arr.length > DEFAULT_LIMITS.maxSheets) {
    return { ok: false, error: `too many sheets (max ${DEFAULT_LIMITS.maxSheets})` };
  }

  for (const [i, s] of arr.entries()) {
    if (!isObj(s)) return { ok: false, error: `sheets[${i}] must be object` };
    if (!isString(s.profileId)) return { ok: false, error: `sheets[${i}].profileId must be string` };

    // Stats must exist (your type says stats is required)
    if (!isObj(s.stats)) return { ok: false, error: `sheets[${i}].stats must be object` };
    const statKeys = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
    for (const k of statKeys) {
      if (typeof s.stats[k] !== "number") return { ok: false, error: `sheets[${i}].stats.${k} must be number` };
    }

    if (!isObj(s.hp)) return { ok: false, error: `sheets[${i}].hp must be object` };
    if (typeof s.hp.current !== "number" || typeof s.hp.max !== "number") {
      return { ok: false, error: `sheets[${i}].hp.current/max must be number` };
    }
    if (s.hp.temp !== undefined && typeof s.hp.temp !== "number") {
      return { ok: false, error: `sheets[${i}].hp.temp must be number` };
    }

    // inventory required
    if (!Array.isArray(s.inventory)) return { ok: false, error: `sheets[${i}].inventory must be array` };
    for (const [j, it] of s.inventory.entries()) {
      if (!isObj(it)) return { ok: false, error: `sheets[${i}].inventory[${j}] must be object` };
      if (!isString(it.id) || !isString(it.name)) {
        return { ok: false, error: `sheets[${i}].inventory[${j}] id/name must be string` };
      }
      if (it.qty !== undefined && typeof it.qty !== "number") {
        return { ok: false, error: `sheets[${i}].inventory[${j}].qty must be number` };
      }
      if (it.notes !== undefined && typeof it.notes !== "string") {
        return { ok: false, error: `sheets[${i}].inventory[${j}].notes must be string` };
      }
    }

    // optional arrays
    const optionalArrayFields = ["equipment", "spells", "abilities"] as const;
    for (const f of optionalArrayFields) {
      if (s[f] === undefined) continue;
      if (!Array.isArray(s[f])) return { ok: false, error: `sheets[${i}].${f} must be array` };
      for (const [j, it] of (s[f] as any[]).entries()) {
        if (!isObj(it) || !isString(it.id) || !isString(it.name)) {
          return { ok: false, error: `sheets[${i}].${f}[${j}] id/name must be string` };
        }
        if (it.notes !== undefined && typeof it.notes !== "string") {
          return { ok: false, error: `sheets[${i}].${f}[${j}].notes must be string` };
        }
      }
    }
  }

  // scenarioId is not stored on sheet rows, so we can’t cross-check here.
  // You can cross-check later by ensuring the sheet.profileId exists in imported profiles.

  return { ok: true, value: arr as CharacterSheet[] };
}

/**
 * Validate the bundle + all optional payloads.
 * Use this BEFORE any import logic.
 */
export function validateScenarioExportBundleV1(
  raw: any,
  opts?: Partial<typeof DEFAULT_LIMITS> & { jsonBytes?: number }
): ValidateResult<ScenarioExportBundleV1> {
  const limits = { ...DEFAULT_LIMITS, ...(opts ?? {}) };

  if (typeof limits.jsonBytes === "number" && limits.jsonBytes > limits.maxJsonBytes) {
    return { ok: false, error: `file too large (max ${limits.maxJsonBytes} bytes)` };
  }

  if (!isObj(raw)) return { ok: false, error: "bundle must be an object" };
  if (raw.version !== 1) return { ok: false, error: "bundle.version must be 1" };
  if (!isString(raw.exportedAt)) return { ok: false, error: "bundle.exportedAt must be string" };
  if (!isIsoish(raw.exportedAt)) return { ok: false, error: "bundle.exportedAt must look like ISO string" };

  const sc = validateScenario(raw.scenario);
  if (!sc.ok) return sc as any;

  const scenarioId = sc.value.id;

  const profiles = validateProfiles(raw.profiles, scenarioId);
  if (!profiles.ok) return profiles as any;

  const posts = validatePosts(raw.posts, scenarioId);
  if (!posts.ok) return posts as any;

  const reposts = validateReposts(raw.reposts, scenarioId);
  if (!reposts.ok) return reposts as any;

  const sheets = validateSheets(raw.sheets, scenarioId);
  if (!sheets.ok) return sheets as any;

  // Extra cross-checks (very important)
  const profileIdSet = new Set<string>((profiles.value ?? []).map((p) => String(p.id)));

  // posts reference authorProfileId
  for (const p of posts.value ?? []) {
    if (!profileIdSet.has(String(p.authorProfileId))) {
      return { ok: false, error: `post ${String(p.id)} references missing authorProfileId` };
    }
    if (p.parentPostId && !isString(p.parentPostId)) {
      return { ok: false, error: `post ${String(p.id)} parentPostId invalid` };
    }
    if (p.quotedPostId && !isString(p.quotedPostId)) {
      return { ok: false, error: `post ${String(p.id)} quotedPostId invalid` };
    }
  }

  // reposts reference profileId + postId
  const postIdSet = new Set<string>((posts.value ?? []).map((p) => String(p.id)));
  for (const r of reposts.value ?? []) {
    if (!profileIdSet.has(String(r.profileId))) {
      return { ok: false, error: `repost ${String(r.id)} references missing profileId` };
    }
    if (!postIdSet.has(String(r.postId))) {
      return { ok: false, error: `repost ${String(r.id)} references missing postId` };
    }
  }

  // sheets reference profileId
  for (const s of sheets.value ?? []) {
    if (!profileIdSet.has(String(s.profileId))) {
      return { ok: false, error: `sheet references missing profileId ${String(s.profileId)}` };
    }
  }

  const cleaned: ScenarioExportBundleV1 = {
    version: 1,
    exportedAt: String(raw.exportedAt),
    scenario: sc.value,
    profiles: profiles.value,
    posts: posts.value,
    reposts: reposts.value,
    sheets: sheets.value,
  };

  return { ok: true, value: cleaned };
}