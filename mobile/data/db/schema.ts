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
  name?: string;
  email?: string;
  passwordHash?: string;
};

// backend `auth_identities` (OAuth identities linked to a user)
export type AuthIdentity = {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ScenarioTag = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type ScenarioSettings = {
  profileLimitMode?: "per_owner" | "per_scenario";
  pinnedPostIds?: string[];
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
  mode: "story" | "campaign";
  gmUserIds?: string[]; // (creator is default)
  settings?: ScenarioSettings; 
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
  insertedAt: string;
  updatedAt?: string;
  postType?: "rp" | "roll" | "log" | "quest" | "combat" | "gm";
  isPinned?: boolean;
  pinOrder?: number;
  meta?: any; // roll payload, quest state, combat turn, etc.
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
  createdAt?: string;
  updatedAt?: string;
};

// backend `scenario_players` join table
export type ScenarioPlayer = {
  scenarioId: string;
  userId: string;
};

// backend `selected_profile_by_user_scenario`
export type SelectedProfileByUserScenario = {
  userId: string;
  scenarioId: string;
  profileId: string;
  updatedAt: string;
};

// backend `app_meta`
export type AppMeta = {
  key: string;
  value: any;
  updatedAt: string;
};

// backend `scenario_tags` join table (scenario <-> global_tags)
export type ScenarioTagLink = {
  scenarioId: string;
  tagKey: string;
  createdAt: string;
};

export type CharacterSheet = {
  profileId: string;

  // identity
  name?: string;
  race?: string;
  class?: string;
  level?: number;
  alignment?: string;
  background?: string;

  // stats
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };

  // combat
  hp: { current: number; max: number; temp?: number };
  status?: string; // “ok”, “down”, etc.

  // inventory
  inventory: Array<{ id: string; name: string; qty?: number; notes?: string }>;
  equipment?: Array<{ id: string; name: string; notes?: string }>;

  // spells & abilities
  spells?: Array<{ id: string; name: string; notes?: string }>;
  abilities?: Array<{ id: string; name: string; notes?: string }>;

  // notes
  publicNotes?: string;
  privateNotes?: string; // visible owner + MJ only
  createdAt?: string;
  updatedAt?: string;
};

export type Like = {
  id: string;          // e.g. `li_${Date.now()}_${...}` or `${profileId}:${postId}`
  scenarioId: string;
  postId: string;
  profileId: string;   // who liked
  createdAt: string;
};

// NOTE: migrate away from Profile.likedPostIds (legacy)
// export type Profile = { ... likedPostIds?: string[] ... } // remove when you’re ready

export type Conversation = {
  id: string;
  scenarioId: string;
  participantProfileIds: string[]; // 1:1 or group

  // group chat customization (optional)
  title?: string;
  avatarUrl?: string;

  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
};

export type Message = {
  id: string;
  scenarioId: string;
  conversationId: string;
  senderProfileId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string;
};

export type DbV5 = {
  version: 5;
  seededAt: string;
  users: Record<string, User>;
  /** (auth_identities) */
  authIdentities?: Record<string, AuthIdentity>; // key = authIdentity.id
  scenarios: Record<string, Scenario>;
  /** (scenario_players) */
  scenarioPlayers?: Record<string, ScenarioPlayer>; // key = `${scenarioId}|${userId}`
  profiles: Record<string, Profile>;
  posts: Record<string, Post>;
  reposts: Record<string, Repost>;
  likes?: Record<string, Like>; // key = `${scenarioId}|${profileId}|${postId}` (scenario-scoped)
  selectedProfileByScenario: Record<string, string>;
  /** (selected_profile_by_user_scenario) */
  selectedProfileByUserScenario?: Record<string, SelectedProfileByUserScenario>; // key = `${userId}|${scenarioId}`
  tags: Record<string, GlobalTag>; // key -> tag
  /** (scenario_tags) */
  scenarioTags?: Record<string, ScenarioTagLink>; // key = `${scenarioId}|${tagKey}`
  sheets: Record<string, CharacterSheet>; // key = profileId
  /** (app_meta) */
  appMeta?: Record<string, AppMeta>; // key = appMeta.key
  /** DM conversations (local/mock + can be swapped for real backend later) */
  conversations?: Record<string, Conversation>; // key = conversation.id
  /** DM messages */
  messages?: Record<string, Message>; // key = message.id
};