

import type { DbV1, Post, Profile, Scenario, User } from "./schema";
import { writeDb } from "./storage";
import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
// import { MOCK_SCENARIOS } from "@/mocks/scenarios"; // if you have
// import { MOCK_USERS } from "@/mocks/users";         // if you have

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const item of list) r[String(item.id)] = item;
  return r;
}

export async function seedDbIfNeeded(existing: DbV1 | null) {
  if (existing && existing.version === 1) return existing;

  // scenarios/users: add real mocks when you have them
  const users: User[] = [{ id: "u14", username: "dev", avatarUrl: "https://i.pravatar.cc/150?u=dev" }];
  const scenarios: Scenario[] = Object.keys(MOCK_FEEDS).map((id) => ({ id, name: id, cover: 'https://i.pravatar.cc/150?u=dev', playerIds: ["u14"] }));

  const profiles: Profile[] = MOCK_PROFILES.map((p: any) => ({
    id: String(p.id),
    scenarioId: String(p.scenarioId),
    ownerUserId: String(p.ownerUserId ?? "u14"),
    displayName: String(p.displayName ?? ""),
    handle: String(p.handle ?? ""),
    avatarUrl: String(p.avatarUrl ?? `https://i.pravatar.cc/150?u=${p.id}`),
    headerUrl: typeof p.headerUrl === "string" ? p.headerUrl : undefined,
    bio: typeof p.bio === "string" ? p.bio : undefined,
    isPublic: !!p.isPublic,
    joinedDate: typeof p.joinedDate === "string" ? p.joinedDate : undefined,
    location: typeof p.location === "string" ? p.location : undefined,
    link: typeof p.link === "string" ? p.link : undefined,
    followersCount: Number.isFinite(p.followersCount) ? p.followersCount : (p.followerCount ?? 0),
    followingCount: Number.isFinite(p.followingCount) ? p.followingCount : 0,
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
          ? m.imageUrls.filter((u: any) => typeof u === "string")
          : m.imageUrls ? [String(m.imageUrls)] : undefined,
        replyCount: m.replyCount ?? 0,
        repostCount: m.repostCount ?? 0,
        likeCount: m.likeCount ?? 0,
        parentPostId: m.parentPostId ?? undefined,
        quotedPostId: m.quotedPostId ?? undefined,
      });
    }
  }

  const db: DbV1 = {
    version: 1,
    seededAt: new Date().toISOString(),
    users: toRecord(users),
    scenarios: toRecord(scenarios),
    profiles: toRecord(profiles),
    posts: toRecord(posts),
    selectedProfileByScenario: {},
  };

  await writeDb(db);
  return db;
}