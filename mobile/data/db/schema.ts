//mobile/data/db/schema.ts
export type User = {
  id: string;
  username: string;
  avatarUrl: string;
};

export type Scenario = {
  id: string;
  name: string;
  cover: string;
  playerIds: string[];
};

export type Profile = {
  id: string;
  scenarioId: string;
  ownerUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;   // IMPORTANT: avatar lives here, not in separate keys
  headerUrl?: string;
  bio?: string;
  isPublic?: boolean;
  joinedDate?: string;
  location?: string;
  link?: string;
  followerCount?: number;
  followingCount?: number;
};

export type Post = {
  id: string;
  scenarioId: string;
  authorProfileId: string;
  text: string;
  createdAt: string;
  imageUrls?: string[];
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  parentPostId?: string;
  quotedPostId?: string;
};

export type DbV1 = {
  version: 1;
  seededAt: string;
  users: Record<string, User>;
  scenarios: Record<string, Scenario>;
  profiles: Record<string, Profile>;
  posts: Record<string, Post>;
  selectedProfileByScenario: Record<string, string>;
};