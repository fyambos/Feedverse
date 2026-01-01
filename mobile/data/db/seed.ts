// mobile/data/db/seed.ts
import type {
  DbV5,
  Post,
  Profile,
  Scenario,
  User,
  Repost,
  ScenarioTag,
  GlobalTag,
  CharacterSheet,
} from "./schema";
import { writeDb } from "./storage";

import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
import { MOCK_USERS } from "@/mocks/users";
import { MOCK_SCENARIOS } from "@/mocks/scenarios";
import { MOCK_SHEETS } from "@/mocks/sheets";
import { tagKeyFromInput, buildGlobalTagFromKey } from "@/lib/tags";

/**
 * FORCE RESEED MODE
 * Overwrites the entire local DB from mocks.
 */
const FORCE_RESEED = false;

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const item of list) r[String(item.id)] = item;
  return r;
}

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

// defensif: garantit un string[] propre
function toStringArray(x: any): string[] {
  if (!Array.isArray(x)) return [];
  return x.map(String).filter(Boolean);
}

// clamp simple pour pinOrder
function toNumberOrUndef(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

// defensif: number|undefined
function toIntOrUndef(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export async function seedDbIfNeeded(existing: any | null) {
  // keep your “don’t reseed” behavior when FORCE_RESEED is false
  if (!FORCE_RESEED && existing && existing.version === 5) return existing as DbV5;

  const now = nowIso();

  // --- USERS
  const users: User[] = MOCK_USERS.map((u) => ({
    id: String(u.id),
    username: String(u.username),
    avatarUrl: String(u.avatarUrl),
    createdAt: String((u as any).createdAt ?? now),
    updatedAt: typeof (u as any).updatedAt === "string" ? (u as any).updatedAt : undefined,
    settings: (u as any).settings ?? undefined,
  }));

  // --- PROFILES
  const profiles: Profile[] = MOCK_PROFILES.map((p) => {
    const createdAt = String((p as any).createdAt ?? now);

    return {
      id: String(p.id),
      scenarioId: String(p.scenarioId),
      ownerUserId: String(p.ownerUserId),
      displayName: String((p as any).displayName ?? ""),
      handle: normalizeHandle((p as any).handle ?? ""),
      avatarUrl: String((p as any).avatarUrl ?? `https://i.pravatar.cc/150?u=${p.id}`),
      headerUrl: typeof (p as any).headerUrl === "string" ? (p as any).headerUrl : undefined,
      bio: typeof (p as any).bio === "string" ? (p as any).bio : undefined,

      isPublic: typeof (p as any).isPublic === "boolean" ? (p as any).isPublic : undefined,
      isPrivate: typeof (p as any).isPrivate === "boolean" ? (p as any).isPrivate : undefined,

      joinedDate: typeof (p as any).joinedDate === "string" ? (p as any).joinedDate : undefined,
      location: typeof (p as any).location === "string" ? (p as any).location : undefined,
      link: typeof (p as any).link === "string" ? (p as any).link : undefined,

      followerCount: Number.isFinite((p as any).followerCount)
        ? Number((p as any).followerCount)
        : Number.isFinite((p as any).followersCount)
        ? Number((p as any).followersCount)
        : 0,
      followingCount: Number.isFinite((p as any).followingCount) ? Number((p as any).followingCount) : 0,

      createdAt,
      updatedAt: typeof (p as any).updatedAt === "string" ? (p as any).updatedAt : undefined,

      likedPostIds: Array.isArray((p as any).likedPostIds) ? (p as any).likedPostIds.map(String) : [],
    };
  });

  // --- POSTS
  const posts: Post[] = [];
  for (const scenarioId of Object.keys(MOCK_FEEDS)) {
    for (const m of MOCK_FEEDS[scenarioId] ?? []) {
      const createdAt = String((m as any).createdAt ?? now);

      posts.push({
        id: String((m as any).id),
        scenarioId: String((m as any).scenarioId ?? scenarioId),
        authorProfileId: String((m as any).authorProfileId),
        text: String((m as any).text ?? ""),
        createdAt,

        imageUrls: Array.isArray((m as any).imageUrls)
          ? (m as any).imageUrls.filter((u: any): u is string => typeof u === "string" && u.length > 0)
          : (m as any).imageUrls
          ? [String((m as any).imageUrls)]
          : undefined,

        replyCount: Number((m as any).replyCount ?? 0),
        repostCount: Number((m as any).repostCount ?? 0),
        likeCount: Number((m as any).likeCount ?? 0),

        parentPostId: (m as any).parentPostId ? String((m as any).parentPostId) : undefined,
        quotedPostId: (m as any).quotedPostId ? String((m as any).quotedPostId) : undefined,

        insertedAt: String((m as any).insertedAt ?? createdAt),
        updatedAt: typeof (m as any).updatedAt === "string" ? (m as any).updatedAt : undefined,

        postType: (m as any).postType as Post["postType"] | undefined,
        isPinned: typeof (m as any).isPinned === "boolean" ? (m as any).isPinned : undefined,
        pinOrder: toNumberOrUndef((m as any).pinOrder),
        meta: (m as any).meta ?? undefined,
      });
    }
  }

  // --- SCENARIOS + GLOBAL TAG REGISTRY
  const globalTags: Record<string, GlobalTag> = {};

  const scenarios: Scenario[] = MOCK_SCENARIOS.map((s) => {
    const rawTags = Array.isArray((s as any).tags) ? (s as any).tags : [];

    const tags: ScenarioTag[] = rawTags
      .map((t: any) => {
        const raw = String(t?.key ?? t?.name ?? "");
        const key = tagKeyFromInput(raw);
        if (!key) return null;

        if (!globalTags[key]) {
          const built = buildGlobalTagFromKey(key);
          if (!built) return null;
          globalTags[key] = built;
        }

        return {
          id: String(t?.id ?? `t_${key.replace(/-/g, "_")}`),
          key,
          name: globalTags[key].name,
          color: globalTags[key].color,
        } as ScenarioTag;
      })
      .filter(Boolean) as ScenarioTag[];

    // de-dupe tags by key
    const seen = new Set<string>();
    const deduped = tags.filter((tg) => {
      const k = String(tg.key);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const playerIds = Array.from(new Set(toStringArray((s as any).playerIds)));

    const ownerUserId = String((s as any).ownerUserId ?? (playerIds[0] ?? "u14"));

    const mode: Scenario["mode"] = (s as any).mode === "campaign" ? "campaign" : "story";

    // gmUserIds = GM list
    // default: creator is GM; if mock provides list, include creator + dedupe
    const gmFromMock = toStringArray((s as any).gmUserIds);
    const gmUserIds = gmFromMock.length > 0 ? Array.from(new Set([ownerUserId, ...gmFromMock])) : [ownerUserId];

    return {
      id: String(s.id),
      name: String((s as any).name ?? ""),
      cover: String((s as any).cover ?? ""),
      playerIds,

      createdAt: String((s as any).createdAt ?? now),
      updatedAt: String((s as any).updatedAt ?? (s as any).createdAt ?? now),

      inviteCode: String((s as any).inviteCode ?? ""),
      ownerUserId,

      description: typeof (s as any).description === "string" ? (s as any).description : undefined,
      tags: deduped,

      mode,
      gmUserIds,
    };
  });

  // --- REPOST EVENTS (optional)
  const reposts: Repost[] = [];

  // --- CHARACTER SHEETS (campaign)
  // 1) seed from mocks
  // 2) auto-generate missing ones for campaign profiles (players/system), so UI never breaks
  const sheets: Record<string, CharacterSheet> = {};

  // import from mocks (Record<profileId, CharacterSheet>)
  if (MOCK_SHEETS && typeof MOCK_SHEETS === "object") {
    for (const [profileId, sheet] of Object.entries(MOCK_SHEETS as Record<string, any>)) {
      if (!profileId) continue;
      if (!sheet || typeof sheet !== "object") continue;

      const s = sheet as Partial<CharacterSheet>;

      // minimal normalization so you can be messy in mocks without crashing
      sheets[String(profileId)] = {
        profileId: String(s.profileId ?? profileId),

        name: typeof s.name === "string" ? s.name : undefined,
        race: typeof s.race === "string" ? s.race : undefined,
        class: typeof s.class === "string" ? s.class : undefined,
        level: toIntOrUndef(s.level),
        alignment: typeof s.alignment === "string" ? s.alignment : undefined,
        background: typeof s.background === "string" ? s.background : undefined,

        stats: {
          strength: Number((s as any)?.stats?.strength ?? 10),
          dexterity: Number((s as any)?.stats?.dexterity ?? 10),
          constitution: Number((s as any)?.stats?.constitution ?? 10),
          intelligence: Number((s as any)?.stats?.intelligence ?? 10),
          wisdom: Number((s as any)?.stats?.wisdom ?? 10),
          charisma: Number((s as any)?.stats?.charisma ?? 10),
        },

        hp: {
          current: Number((s as any)?.hp?.current ?? 10),
          max: Number((s as any)?.hp?.max ?? 10),
          temp: Number.isFinite(Number((s as any)?.hp?.temp)) ? Number((s as any)?.hp?.temp) : undefined,
        },
        status: typeof s.status === "string" ? s.status : undefined,

        inventory: Array.isArray(s.inventory)
          ? s.inventory.map((it: any) => ({
              id: String(it?.id ?? `i_${Math.random().toString(16).slice(2)}`),
              name: String(it?.name ?? "item"),
              qty: Number.isFinite(Number(it?.qty)) ? Number(it.qty) : undefined,
              notes: typeof it?.notes === "string" ? it.notes : undefined,
            }))
          : [],

        equipment: Array.isArray(s.equipment)
          ? s.equipment.map((it: any) => ({
              id: String(it?.id ?? `e_${Math.random().toString(16).slice(2)}`),
              name: String(it?.name ?? "equipment"),
              notes: typeof it?.notes === "string" ? it.notes : undefined,
            }))
          : undefined,

        spells: Array.isArray(s.spells)
          ? s.spells.map((it: any) => ({
              id: String(it?.id ?? `s_${Math.random().toString(16).slice(2)}`),
              name: String(it?.name ?? "spell"),
              notes: typeof it?.notes === "string" ? it.notes : undefined,
            }))
          : undefined,

        abilities: Array.isArray(s.abilities)
          ? s.abilities.map((it: any) => ({
              id: String(it?.id ?? `a_${Math.random().toString(16).slice(2)}`),
              name: String(it?.name ?? "ability"),
              notes: typeof it?.notes === "string" ? it.notes : undefined,
            }))
          : undefined,

        publicNotes: typeof s.publicNotes === "string" ? s.publicNotes : undefined,
        privateNotes: typeof s.privateNotes === "string" ? s.privateNotes : undefined,
        updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : now,
      };
    }
  }

  // auto-fill missing sheets for campaign scenarios (only if not in MOCK_SHEETS)
  const scenarioById = toRecord(scenarios);
  for (const p of profiles) {
    const sc = scenarioById[p.scenarioId];
    if (!sc || sc.mode !== "campaign") continue;

    if (sheets[p.id]) continue;

    sheets[p.id] = {
      profileId: p.id,
      name: p.displayName,
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hp: { current: 10, max: 10 },
      inventory: [],
      updatedAt: now,
    };
  }

  const db: DbV5 = {
    version: 5,
    seededAt: now,
    users: toRecord(users),
    profiles: toRecord(profiles),
    posts: toRecord(posts),
    scenarios: toRecord(scenarios),
    reposts: toRecord(reposts),
    tags: globalTags,
    sheets,
    selectedProfileByScenario: {},
  };

  await writeDb(db);
  return db;
}