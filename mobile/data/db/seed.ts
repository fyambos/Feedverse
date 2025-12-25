import type { DbV3, Post, Profile, Scenario, User } from "./schema";
import { writeDb } from "./storage";

import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
import { MOCK_USERS } from "@/mocks/users";
import { MOCK_SCENARIOS } from "@/mocks/scenarios"; // <-- add this

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const item of list) r[String(item.id)] = item;
  return r;
}

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

export async function seedDbIfNeeded(existing: DbV3 | null) {
  if (existing && existing.version === 3) return existing;

  const users: User[] = MOCK_USERS.map((u) => ({
    id: String(u.id),
    username: String(u.username),
    avatarUrl: String(u.avatarUrl),
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
    followersCount:
      Number.isFinite((p as any).followersCount)
        ? (p as any).followersCount
        : (p as any).followerCount ?? 0,
    followingCount: Number.isFinite((p as any).followingCount) ? (p as any).followingCount : 0,
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
          ? m.imageUrls.filter((u): u is string => typeof u === "string")
          : m.imageUrls
          ? [String(m.imageUrls)]
          : undefined,
        replyCount: m.replyCount ?? 0,
        repostCount: m.repostCount ?? 0,
        likeCount: m.likeCount ?? 0,
        parentPostId: m.parentPostId ?? undefined,
        quotedPostId: m.quotedPostId ?? undefined,
      });
    }
  }

  const scenarios: Scenario[] = MOCK_SCENARIOS.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    cover: String(s.cover),
    playerIds: Array.from(new Set((s.playerIds ?? []).map(String))),
  }));

  const db: DbV3 = {
    version: 3,
    seededAt: new Date().toISOString(),
    users: toRecord(users),
    profiles: toRecord(profiles),
    posts: toRecord(posts),
    scenarios: toRecord(scenarios),
    selectedProfileByScenario: {},
  };

  await writeDb(db);
  return db;
}
