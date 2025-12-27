// mobile/data/db/seed.ts
import type { DbV4, Post, Profile, Scenario, User, Repost } from "./schema";
import { writeDb } from "./storage";

import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
import { MOCK_USERS } from "@/mocks/users";
import { MOCK_SCENARIOS } from "@/mocks/scenarios";

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const item of list) r[String(item.id)] = item;
  return r;
}

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

export async function seedDbIfNeeded(existing: any | null) {
  // already v4
  if (existing && existing.version === 4) return existing as DbV4;

  // migrate v3 -> v4 (no repost legacy arrays exist anymore in schema,
  // but if your old db had `profiles[*].repostedPostIds`, we convert them to events then drop)
  if (existing && existing.version === 3) {
    const now = new Date().toISOString();

    const next: DbV4 = {
      ...existing,
      version: 4,
      reposts: existing.reposts ?? {},
    };

    // convert old profile.repostedPostIds -> repost events
    for (const pr of Object.values(next.profiles ?? {})) {
      const arr = Array.isArray((pr as any).repostedPostIds) ? (pr as any).repostedPostIds.map(String) : [];
      if (!arr.length) continue;

      for (const postId of arr) {
        const id = `${String((pr as any).id)}|${String(postId)}`;
        if (next.reposts[id]) continue;

        next.reposts[id] = {
          id,
          scenarioId: String((pr as any).scenarioId),
          profileId: String((pr as any).id),
          postId: String(postId),
          createdAt: String((pr as any).updatedAt ?? now),
        };
      }

      // drop legacy
      delete (pr as any).repostedPostIds;
    }

    await writeDb(next);
    return next;
  }

  // fresh seed -> v4
  const users: User[] = MOCK_USERS.map((u) => ({
    id: String(u.id),
    username: String(u.username),
    avatarUrl: String(u.avatarUrl),
    createdAt: String(u.createdAt ?? new Date().toISOString()),
  }));

  const profiles: Profile[] = MOCK_PROFILES.map((p) => ({
    id: String(p.id),
    scenarioId: String(p.scenarioId),
    ownerUserId: String(p.ownerUserId),
    displayName: String(p.displayName ?? ""),
    handle: normalizeHandle(p.handle ?? ""),
    avatarUrl: String(p.avatarUrl ?? `https://i.pravatar.cc/150?u=${p.id}`),
    headerUrl: typeof p.headerUrl === "string" ? p.headerUrl : undefined,
    bio: typeof p.bio === "string" ? p.bio : undefined,
    isPublic: !!p.isPublic,
    joinedDate: typeof p.joinedDate === "string" ? p.joinedDate : undefined,
    location: typeof p.location === "string" ? p.location : undefined,
    link: typeof p.link === "string" ? p.link : undefined,

    followerCount: Number.isFinite((p as any).followerCount)
      ? (p as any).followerCount
      : Number.isFinite((p as any).followersCount)
      ? (p as any).followersCount
      : 0,

    followingCount: Number.isFinite((p as any).followingCount) ? (p as any).followingCount : 0,

    createdAt: String(p.createdAt ?? new Date().toISOString()),
    updatedAt: String(p.updatedAt ?? new Date().toISOString()),

    likedPostIds: Array.isArray((p as any).likedPostIds) ? (p as any).likedPostIds.map(String) : [],
  }));

  const posts: Post[] = [];
  for (const scenarioId of Object.keys(MOCK_FEEDS)) {
    for (const m of MOCK_FEEDS[scenarioId] ?? []) {
      posts.push({
        id: String(m.id),
        scenarioId: String(m.scenarioId ?? scenarioId),
        authorProfileId: String(m.authorProfileId),
        text: String(m.text ?? ""),
        createdAt: String(m.createdAt),
        imageUrls: Array.isArray(m.imageUrls)
          ? m.imageUrls.filter((u: any): u is string => typeof u === "string")
          : m.imageUrls
          ? [String(m.imageUrls)]
          : undefined,
        replyCount: m.replyCount ?? 0,
        repostCount: m.repostCount ?? 0,
        likeCount: m.likeCount ?? 0,
        parentPostId: m.parentPostId ?? undefined,
        quotedPostId: m.quotedPostId ?? undefined,
        insertedAt: String(m.insertedAt ?? new Date().toISOString()),
        updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : undefined,
      });
    }
  }

  const scenarios: Scenario[] = MOCK_SCENARIOS.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    cover: String(s.cover),
    playerIds: Array.from(new Set((s.playerIds ?? []).map(String))),
  }));

  // no reposts in seed by default (unless you want to pre-seed them later)
  const reposts: Repost[] = [];

  const db: DbV4 = {
    version: 4,
    seededAt: new Date().toISOString(),
    users: toRecord(users),
    profiles: toRecord(profiles),
    posts: toRecord(posts),
    scenarios: toRecord(scenarios),
    reposts: toRecord(reposts),
    selectedProfileByScenario: {},
  };

  await writeDb(db);
  return db;
}