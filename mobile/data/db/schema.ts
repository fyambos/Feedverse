// mobile/data/db/schema.ts

export type UserSettings = {
  /**
   * When true, timestamps are shown across the app.
   */
  showTimestamps?: boolean;
  darkMode?: "light" | "dark" | "system";
};

export type User = {
  id: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt?: string;
  settings?: UserSettings;
};

export type ScenarioTag = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type Scenario = {
  id: string;
  name: string;
  cover: string;
  playerIds: string[];
  createdAt: string;
  updatedAt?: string;
  inviteCode: string;
  ownerUserId: string;
  description?: string;
  tags?: ScenarioTag[];
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
  likedPostIds?: string[];
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
  insertedAt: string;
  updatedAt?: string;
};

export type Repost = {
  id: string;
  scenarioId: string;
  profileId: string;
  postId: string;
  createdAt: string;
};

export type GlobalTag = {
  key: string;     // canonical key (lowercase, dash-separated)
  name: string;    // display label (generated from key)
  color: string;   // deterministic + locked
};

export type DbV5 = {
  version: 5;
  seededAt: string;
  users: Record<string, User>;
  scenarios: Record<string, Scenario>;
  profiles: Record<string, Profile>;
  posts: Record<string, Post>;
  reposts: Record<string, Repost>;
  selectedProfileByScenario: Record<string, string>;
  tags: Record<string, GlobalTag>; // key -> tag
};