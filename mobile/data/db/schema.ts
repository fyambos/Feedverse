//mobile/data/db/schema.ts
export type User = {
  id: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt?: string;
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
  avatarUrl: string; 
  headerUrl?: string;
  bio?: string;
  isPublic?: boolean;
  joinedDate?: string;
  location?: string;
  link?: string;
  followerCount?: number;
  followingCount?: number;
  createdAt: string;
  updatedAt?: string;
  isPrivate?: boolean;
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
  updatedAt?: string;
};

export type DbV3 = {
  version: 3;
  seededAt: string;
  users: Record<string, User>;
  scenarios: Record<string, Scenario>;
  profiles: Record<string, Profile>;
  posts: Record<string, Post>;
  selectedProfileByScenario: Record<string, string>;
};