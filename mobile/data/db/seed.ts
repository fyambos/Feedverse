// mobile/data/db/seed.ts
import type { DbV5, Post, Profile, Scenario, User, Repost, ScenarioTag, GlobalTag } from "./schema";
import { writeDb } from "./storage";

import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
import { MOCK_USERS } from "@/mocks/users";
import { MOCK_SCENARIOS } from "@/mocks/scenarios";
import { tagKeyFromInput, buildGlobalTagFromKey } from "@/lib/tags";

/**
 * ✅ FORCE RESEED MODE
 * Overwrites the entire local DB from mocks.
 * Flip back later.
 */
const FORCE_RESEED = true;

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const item of list) r[String(item.id)] = item;
  return r;
}

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function normalizeTagKey(input: string) {
  return String(input).trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
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
      isPublic: !!(p as any).isPublic,
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
      updatedAt: String((p as any).updatedAt ?? createdAt),
      likedPostIds: Array.isArray((p as any).likedPostIds) ? (p as any).likedPostIds.map(String) : [],
    };
  });

  // --- POSTS
  const posts: Post[] = [];
  for (const scenarioId of Object.keys(MOCK_FEEDS)) {
    for (const m of MOCK_FEEDS[scenarioId] ?? []) {
      posts.push({
        id: String((m as any).id),
        scenarioId: String((m as any).scenarioId ?? scenarioId),
        authorProfileId: String((m as any).authorProfileId),
        text: String((m as any).text ?? ""),
        createdAt: String((m as any).createdAt ?? now),
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
        insertedAt: String((m as any).insertedAt ?? (m as any).createdAt ?? now),
        updatedAt: typeof (m as any).updatedAt === "string" ? (m as any).updatedAt : undefined,
      });
    }
  }

  // --- SCENARIOS (includes inviteCode + ownerUserId + description + tags)
  // --- + GLOBAL TAG REGISTRY
  const globalTags: Record<string, GlobalTag> = {};

  const scenarios: Scenario[] = MOCK_SCENARIOS.map((s) => {
    const rawTags = Array.isArray((s as any).tags) ? (s as any).tags : [];

    const tags: ScenarioTag[] = rawTags
      .map((t: any) => {
        // accept either { key } or { name } from mocks / UI
        const raw = String(t?.key ?? t?.name ?? "");
        const key = tagKeyFromInput(raw); // letters/numbers/spaces only + lowercase + dashes
        if (!key) return null;

        // ensure global registry entry exists (canonical name + locked color)
        if (!globalTags[key]) {
          const built = buildGlobalTagFromKey(key);
          if (!built) return null;
          globalTags[key] = built;
        }

        // scenario tag mirrors global tag (locked)
        return {
          id: String(t?.id ?? `t_${key.replace(/-/g, "_")}`),
          key,
          name: globalTags[key].name,
          color: globalTags[key].color,
        } as ScenarioTag;
      })
      .filter(Boolean) as ScenarioTag[];

    // optional: de-dupe tags by key so you never store duplicates
    const seen = new Set<string>();
    const deduped = tags.filter((tg) => {
      const k = String(tg.key);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return {
      id: String(s.id),
      name: String((s as any).name ?? ""),
      cover: String((s as any).cover ?? ""),
      playerIds: Array.from(new Set(((s as any).playerIds ?? []).map(String))),
      createdAt: String((s as any).createdAt ?? now),
      updatedAt: String((s as any).updatedAt ?? (s as any).createdAt ?? now),

      inviteCode: String((s as any).inviteCode ?? ""),

      ownerUserId: String((s as any).ownerUserId ?? ((s as any).playerIds?.[0] ?? "u14")),
      description: typeof (s as any).description === "string" ? (s as any).description : undefined,

      tags: deduped,
    };
  });

  // --- REPOST EVENTS (optional)
  const reposts: Repost[] = [];

  const db: DbV5 = {
    version: 5,
    seededAt: now,
    users: toRecord(users),
    profiles: toRecord(profiles),
    posts: toRecord(posts),
    scenarios: toRecord(scenarios),
    reposts: toRecord(reposts),
    tags: globalTags,
    selectedProfileByScenario: {},
  };

  await writeDb(db);
  return db;
}