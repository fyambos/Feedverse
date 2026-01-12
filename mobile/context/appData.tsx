// mobile/context/appData.tsx
import React from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  DbV5,
  GlobalTag,
  Post,
  Profile,
  Scenario,
  Repost,
  ScenarioTag,
  CharacterSheet,
  Like,
  Conversation,
  Message,
} from "@/data/db/schema";
import { readDb, updateDb, writeDb, subscribeDbChanges } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";
import { buildGlobalTagFromKey } from "@/lib/tags";
import { pickScenarioExportJson } from "@/lib/importExport/importFromFile";
import { importScenarioFromJson } from "@/lib/importExport/importScenario";
import { useAuth } from "@/context/auth";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/apiClient";
import { buildScenarioExportBundleV1 } from "@/lib/importExport/exportScenarioBundle";
import { saveAndShareScenarioExport } from "@/lib/importExport/exportScenario";

// Non-reactive tracker for which conversation is currently being viewed.
// Using a module-level map avoids React state update loops and stays
// consistent across iOS/Android timings.
const activeConversationByScenario: Record<string, string | null> = {};

export function setActiveConversation(scenarioId: string, conversationId: string | null) {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return;
  activeConversationByScenario[sid] = conversationId == null ? null : String(conversationId).trim();
}

export function getActiveConversation(scenarioId: string): string | null {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return null;
  return activeConversationByScenario[sid] ?? null;
}

type AppDataState = {
  isReady: boolean;
  db: DbV5 | null;
};

type PostCursor = string; // `${insertedAt}|${id}`

type PostsPageArgs = {
  scenarioId: string;
  limit?: number;
  cursor?: PostCursor | null;
  filter?: (p: Post) => boolean;
  includeReplies?: boolean;
};

type PostsPageResult = {
  items: Post[];
  nextCursor: PostCursor | null;
};

// profile feed (posts + reposts ordered by activity time)
export type ProfileFeedKind = "post" | "repost";

export type ProfileFeedItem = {
  kind: ProfileFeedKind;
  post: Post;
  activityAt: string; // used for ordering + cursor
  reposterProfileId?: string; // only if kind === "repost"
};

type FeedCursor = string; // `${activityAt}|${kind}|${postId}|${reposterId}`

type ProfileFeedPageArgs = {
  scenarioId: string;
  profileId: string; // viewing profile (whose page we are building)
  tab: "posts" | "media" | "replies" | "likes";
  limit?: number;
  cursor?: FeedCursor | null;
};

type ProfileFeedPageResult = {
  items: ProfileFeedItem[];
  nextCursor: FeedCursor | null;
};

// GM: apply updates to sheets, then create a GM post that summarizes changes
export type GmApplySheetUpdateArgs = {
  scenarioId: string;
  gmProfileId: string; // author of the GM summary post
  targetProfileIds: string[]; // selected targets
  // patch applied to each sheet (shallow merge). You can pass absolute values here.
  patch: Partial<CharacterSheet>;
  // optional: meta labels shown in the GM post (e.g. "HP −1", "Set Status: poisoned")
  label?: string;
};

export type GmApplySheetUpdateResult = {
  postId: string;
  updatedProfileIds: string[];
  summaryText: string;
};

type MessageCursor = string; // `${createdAt}|${id}`

type MessagesPageArgs = {
  scenarioId: string;
  conversationId: string;
  limit?: number;
  cursor?: MessageCursor | null;
};

type MessagesPageResult = {
  items: Message[];
  nextCursor: MessageCursor | null;
};

type AppDataApi = {
    // conversation view helpers
    setViewingConversation: (scenarioId: string, conversationId?: string | null) => Promise<void>;

  // scenarios
  getScenarioById: (id: string) => Scenario | null;
  listScenarios: () => Scenario[];
  upsertScenario: (s: Scenario) => Promise<void>;
  joinScenarioByInviteCode: (
    inviteCode: string,
    userId: string
  ) => Promise<{ scenario: Scenario; alreadyIn: boolean } | null>;
  transferScenarioOwnership: (
    scenarioId: string,
    fromUserId: string,
    toUserId: string
  ) => Promise<Scenario | null>;
  transferProfilesToUser: (args: {
    scenarioId: string;
    profileIds: string[];
    toUserId: string;
  }) => Promise<{ ok: true; transferred: number; skipped: string[] } | { ok: false; error: string }>;

  // adopt a shared (public) profile; claims ownership and makes it private
  adoptPublicProfile: (args: {
    scenarioId: string;
    profileId: string;
    userId: string;
  }) => Promise<{ ok: true } | { ok: false, error: string }>;

  leaveScenario: (scenarioId: string, userId: string) => Promise<{ deleted: boolean } | null>;
  deleteScenario: (scenarioId: string, ownerUserId: string) => Promise<boolean>;
  setScenarioMode: (scenarioId: string, mode: "story" | "campaign") => Promise<Scenario | null>;

  // profiles
  getProfileById: (id: string) => Profile | null;
  getProfileByHandle: (scenarioId: string, handle: string) => Profile | null;
  listProfilesForScenario: (scenarioId: string) => Profile[];

  // posts
  getPostById: (id: string) => Post | null;
  listPostsForScenario: (scenarioId: string) => Post[];
  listRepliesForPost: (postId: string) => Post[];

  // paging
  listPostsPage: (args: PostsPageArgs) => PostsPageResult;
  listProfileFeedPage: (args: ProfileFeedPageArgs) => ProfileFeedPageResult;

  // selection
  getSelectedProfileId: (scenarioId: string) => string | null;

  // actions
  setSelectedProfileId: (scenarioId: string, profileId: string | null) => Promise<void>;
  upsertProfile: (p: Profile) => Promise<void>;
  deleteProfileCascade: (scenarioId: string, profileId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  upsertPost: (p: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;

  // likes
  toggleLike: (scenarioId: string, postId: string) => Promise<void>;
  isPostLikedBySelectedProfile: (scenarioId: string, postId: string) => boolean;
  // --- added like helpers ---
  isPostLikedByProfile: (profileId: string, postId: string) => boolean;
  listLikedPostIdsForProfile: (scenarioId: string, profileId: string) => string[];
  toggleLikePost: (scenarioId: string, profileId: string, postId: string) => Promise<{ ok: boolean; liked: boolean }>;

  // reposts
  toggleRepost: (scenarioId: string, postId: string) => Promise<void>;
  isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => boolean;

  // helpers
  isPostRepostedByProfileId: (profileId: string, postId: string) => boolean;
  getRepostEventForProfile: (profileId: string, postId: string) => Repost | null;

  // pins (campaign)
  togglePinPost: (scenarioId: string, postId: string, nextPinned: boolean) => Promise<void>;
  listPinnedPostsForScenario: (scenarioId: string) => Post[];
  reorderPinnedPostsForScenario: (scenarioId: string, orderedPostIds: string[]) => Promise<void>;

  // sheets
  getCharacterSheetByProfileId: (profileId: string) => CharacterSheet | null;
  upsertCharacterSheet: (sheet: CharacterSheet) => Promise<void>;

  // GM helper
  gmApplySheetUpdate: (args: GmApplySheetUpdateArgs) => Promise<GmApplySheetUpdateResult>;

  // GM helper: commit a full sheet update and a custom GM post in a single DB write
  gmCommitSheetAndPostText: (args: {
    scenarioId: string;
    gmProfileId: string;
    targetProfileId: string;
    nextSheet: CharacterSheet;
    postText: string;
  }) => Promise<{ postId: string }>;

  // import/export
  importScenarioFromFile: (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }) => Promise<
    | { ok: true; scenarioId: string; importedProfiles: number; importedPosts: number; renamedHandles: Array<{ from: string; to: string }> }
    | { ok: false; error: string }
  >;
  exportScenarioToFile: (args: {
    scenarioId: string;
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
    profileIds?: string[]; // if undefined => export all scenario profiles
  }) => Promise<
    | { ok: true; uri: string; filename: string; counts: { profiles: number; posts: number; reposts: number; sheets: number } }
    | { ok: false; error: string }
  >;
  previewImportScenarioFromFile: (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }) => Promise<
    | {
        ok: true;
        fileName?: string;
        jsonBytes: number;
        preview: {
          willCreateNewScenarioId: boolean;
          importedProfiles: number;
          importedPosts: number;
          importedReposts: number;
          importedSheets: number;
          renamedHandles: Array<{ from: string; to: string }>;
          skipped: {
            profilesDueToLimit: number;
            postsDueToMissingProfile: number;
            repostsDueToMissingProfileOrPost: number;
            sheetsDueToMissingProfile: number;
          };
        };
      }
    | { ok: false, error: string }
  >;

  // scenario settings
  getScenarioSettings: (scenarioId: string) => any;
  updateScenarioSettings: (scenarioId: string, patch: any) => Promise<void>;

  // ===== DMs =====
  // backend-mode helpers (no-op in local mode)
  syncConversationsForScenario: (scenarioId: string) => Promise<void>;
  syncProfilesForScenario: (scenarioId: string) => Promise<void>;
  syncMessagesForConversation: (args: { scenarioId: string; conversationId: string; limit?: number }) => Promise<void>;

  listConversationsForScenario: (scenarioId: string, profileId: string) => Conversation[];
  listMessagesPage: (args: MessagesPageArgs) => MessagesPageResult;
  upsertConversation: (c: Conversation) => Promise<void>;
  deleteConversationCascade: (args: { scenarioId: string; conversationId: string }) => Promise<void>;
  updateConversationMeta: (args: {
    scenarioId: string;
    conversationId: string;
    title?: string | null;
    avatarUrl?: string | null;
  }) => Promise<void>;
  updateConversationParticipants: (args: {
    scenarioId: string;
    conversationId: string;
    participantProfileIds: string[];
  }) => Promise<void>;
  sendMessage: (args: {
    scenarioId: string;
    conversationId: string;
    senderProfileId: string;
    text: string;
    imageUris?: string[];
  }) => Promise<{ ok: true; messageId: string } | { ok: false; error: string }>;

  updateMessage: (args: {
    scenarioId: string;
    messageId: string;
    text?: string;
    senderProfileId?: string;
  }) => Promise<void>;
  deleteMessage: (args: { scenarioId: string; messageId: string }) => Promise<void>;
  reorderMessagesInConversation: (args: {
    scenarioId: string;
    conversationId: string;
    orderedMessageIds: string[];
  }) => Promise<void>;

  // helpers for DM UI
  getConversationById: (conversationId: string) => Conversation | null;
  getOrCreateConversation: (args: {
    scenarioId: string;
    participantProfileIds: string[];
    selectedProfileId?: string;
  }) => Promise<{ ok: true; conversationId: string } | { ok: false, error: string }>;
  listSendAsProfilesForScenario: (scenarioId: string) => { owned: Profile[]; public: Profile[] };
};


// Simple event emitter for message events
type MessageEventHandler = (msg: Message) => void;
const messageEventHandlers = new Set<MessageEventHandler>();
export function subscribeToMessageEvents(handler: MessageEventHandler) {
  messageEventHandlers.add(handler);
  return () => messageEventHandlers.delete(handler);
}

// Typing event emitter
type TypingEvent = {
  scenarioId?: string;
  conversationId?: string;
  profileId?: string;
  typing?: boolean;
  userId?: string;
};
type TypingEventHandler = (ev: TypingEvent) => void;
const typingEventHandlers = new Set<TypingEventHandler>();
export function subscribeToTypingEvents(handler: TypingEventHandler) {
  typingEventHandlers.add(handler);
  return () => typingEventHandlers.delete(handler);
}

// Notification event emitter (fallback if native notifications not available)
type AppNotification = {
  id: string;
  title: string;
  body?: string | null;
  scenarioId?: string | null;
  conversationId?: string | null;
  data?: Record<string, any> | null;
};
type NotificationHandler = (n: AppNotification) => void;
const notificationHandlers = new Set<NotificationHandler>();
export function subscribeToNotifications(handler: NotificationHandler) {
  notificationHandlers.add(handler);
  return () => notificationHandlers.delete(handler);
}

export async function presentNotification(n: AppNotification) {
  try {
    // Try native notifications if available (expo-notifications or similar)
    // Use a dynamic require so we don't crash when dependency isn't installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");
    if (Notifications && typeof Notifications.scheduleNotificationAsync === "function") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title,
          body: n.body ?? undefined,
          data: { scenarioId: n.scenarioId, conversationId: n.conversationId, ...n.data },
        },
        trigger: null,
      });
      return;
    }
  } catch {
    // ignore - fallback to in-app handlers
  }

  // Fallback: notify any in-app listeners
  for (const h of notificationHandlers) {
    try {
      h(n);
    } catch {}
  }
}

const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
}

function makePostCursor(p: Post): PostCursor {
  return `${String((p as any).insertedAt ?? "")}|${String(p.id)}`;
}

function sortDescByCreatedAtThenId(a: Post, b: Post) {
  const c = String(b.createdAt).localeCompare(String(a.createdAt));
  if (c !== 0) return c;
  return String(b.id).localeCompare(String(a.id));
}

function sortAscByCreatedAtThenId(a: Post, b: Post) {
  const c = String(a.createdAt).localeCompare(String(b.createdAt));
  if (c !== 0) return c;
  return String(a.id).localeCompare(String(b.id));
}

function hasAnyMedia(p: any) {
  const urls = p?.imageUrls;
  if (Array.isArray(urls) && urls.length > 0) return true;
  const single = p?.imageUrl;
  if (typeof single === "string" && single.length > 0) return true;
  const media = p?.media;
  if (Array.isArray(media) && media.length > 0) return true;
  return false;
}

function parsePgTextArrayLiteral(input: string): string[] {
  const s = String(input ?? "").trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return [];
  const body = s.slice(1, -1);
  if (!body) return [];

  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let escape = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      const v = cur.trim();
      if (v && v.toUpperCase() !== "NULL") out.push(v);
      cur = "";
      continue;
    }

    cur += ch;
  }

  const last = cur.trim();
  if (last && last.toUpperCase() !== "NULL") out.push(last);
  return out.map((x) => String(x)).filter(Boolean);
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();

    // JSON array?
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        // ignore
      }
    }

    // Postgres array literal?
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return parsePgTextArrayLiteral(trimmed);
    }
  }
  return [];
}

function makeFeedCursor(item: ProfileFeedItem): FeedCursor {
  const rep = item.reposterProfileId ? String(item.reposterProfileId) : "";
  return `${String(item.activityAt)}|${String(item.kind)}|${String(item.post.id)}|${rep}`;
}

// --- pins helpers (stored on scenario.settings.pinnedPostIds)
function getPinnedIdsFromScenario(db: DbV5, scenarioId: string): string[] {
  const sid = String(scenarioId);
  const s = db.scenarios?.[sid];
  const arr = ((s as any)?.settings?.pinnedPostIds ?? []) as any;
  return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(String)));
}

// small util: diff shallow keys for GM post text
function diffShallow(prev: any, next: any): string[] {
  const lines: string[] = [];
  const keys = new Set<string>([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);

  const skip = new Set(["updatedAt", "createdAt", "profileId", "ownerProfileId", "id", "scenarioId"]);

  for (const k of Array.from(keys)) {
    if (skip.has(k)) continue;

    const a = (prev ?? {})[k];
    const b = (next ?? {})[k];

    const same =
      a === b ||
      (Number.isNaN(a) && Number.isNaN(b)) ||
      (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

    if (same) continue;

    // make short-ish readable output
    const aStr = typeof a === "string" ? a : a == null ? "—" : JSON.stringify(a);
    const bStr = typeof b === "string" ? b : b == null ? "—" : JSON.stringify(b);

    lines.push(`• ${k}: ${aStr} → ${bStr}`);
  }

  return lines;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppDataState>({
    isReady: false,
    db: null,
  });

  const isUuidLike = React.useCallback((id: string) => {
    const s = String(id ?? "").trim();
    // covers common UUID variants; backend ids for users/scenarios/profiles are UUIDs
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }, []);

  const isBackendMode = React.useCallback(
    (token: string | null | undefined) => {
      const t = String(token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      return Boolean(t && baseUrl);
    },
    [],
  );

  React.useEffect(() => {
    (async () => {
      const existing = await readDb();
      const db = await seedDbIfNeeded(existing);
      setState({ isReady: true, db });
    })();
  }, []);

  // Keep AppDataProvider state in sync when other modules call `updateDb`.
  React.useEffect(() => {
    const unsub = subscribeDbChanges((db) => {
      try {
        setState((prev) => ({ isReady: true, db }));
      } catch {}
    });

    // Important: React cleanup functions must return void (not a boolean).
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  const db = state.db;

  const auth = useAuth();
  const currentUserId = String(auth.userId ?? "");

  const router = useRouter();

  // Notification listener refs
  const notificationResponseListenerRef = React.useRef<any | null>(null);
  const notificationReceivedListenerRef = React.useRef<any | null>(null);

  // Request notification permissions and register handlers when ready
  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic require: expo-notifications is only available in builds with native module.
        let Notifications: any = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          Notifications = require("expo-notifications");
        } catch (e) {
          Notifications = null;
        }
        if (!Notifications) return;

        // Ensure notifications show while foregrounded (optional)
        if (Notifications.setNotificationHandler) {
          try {
            Notifications.setNotificationHandler({
              handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
            });
          } catch {}
        }

        // Request permissions (best-effort)
        try {
          const perms = await (Notifications.getPermissionsAsync?.() ?? Notifications.requestPermissionsAsync?.());
          const status = perms?.status ?? (perms?.granted ? "granted" : undefined);
          if (status !== "granted") {
            try { await Notifications.requestPermissionsAsync?.(); } catch {}
          }
        } catch {}

        // Register response handler: navigate to conversation when tapped
        try {
          notificationResponseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
            try {
              const data = response?.notification?.request?.content?.data ?? response?.notification?.data ?? {};
              const sid = String(data?.scenarioId ?? data?.scenario_id ?? "");
              const conv = String(data?.conversationId ?? data?.conversation_id ?? "");
              const targetProfileId = String(data?.profileId ?? data?.profile_id ?? "").trim();
              if (sid && conv) {
                // If notification is for a specific owned profile, switch selection first.
                if (targetProfileId) {
                  try {
                    void updateDb((prev) => ({
                      ...(prev as any),
                      selectedProfileByScenario: {
                        ...((prev as any).selectedProfileByScenario ?? {}),
                        [sid]: targetProfileId,
                      },
                    })).catch(() => {});
                  } catch {}
                }
                // Navigate via the inbox screen so it can sync state before opening the thread.
                // Jumping directly to the thread can land on an infinite loading state if the
                // conversation/messages haven't been synced yet.
                try {
                  // Use replace (not push) so the app's active tab navigator
                  // becomes the notification's scenario. Avoid dismissAll(): it
                  // can dispatch POP_TO_TOP when no stack is present.
                  setTimeout(() => {
                    try {
                      router.replace({
                        pathname: "/(scenario)/[scenarioId]/(tabs)/messages",
                        params: { scenarioId: sid, openConversationId: conv },
                      } as any);
                    } catch {}
                  }, 0);
                } catch {}
              }
            } catch {}
          });

          // optional: received listener (foreground)
          notificationReceivedListenerRef.current = Notifications.addNotificationReceivedListener((notif: any) => {
            // we could update badge or local state here
          });
        } catch {}
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      try { notificationResponseListenerRef.current?.remove?.(); } catch {}
      try { notificationReceivedListenerRef.current?.remove?.(); } catch {}
    };
  }, [state.isReady, state.db, auth.isReady, router]);

  const lastBackendUserIdRef = React.useRef<string | null>(null);
  const autoSelectFirstProfileRef = React.useRef<{ inFlight: boolean; lastAtMs: number }>({ inFlight: false, lastAtMs: 0 });

  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    const token = String(auth.token ?? "").trim();
    if (!isBackendMode(token)) {
      lastBackendUserIdRef.current = null;
      return;
    }

    // keep track of last backend user id (no-op beyond storing value for now)
    lastBackendUserIdRef.current = String(auth.userId ?? null);
  }, [state.isReady, state.db, auth.isReady, auth.token, auth.userId, isBackendMode]);

  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    const token = String(auth.token ?? "").trim();
    if (!isBackendMode(token)) return;

    const uid = String(auth.userId ?? "").trim();
    if (!uid) return;

    const nowMs = Date.now();
    if (autoSelectFirstProfileRef.current.inFlight) return;
    if (nowMs - autoSelectFirstProfileRef.current.lastAtMs < 800) return;

    autoSelectFirstProfileRef.current.inFlight = true;
    autoSelectFirstProfileRef.current.lastAtMs = nowMs;

    (async () => {
      const nextDb = await updateDb((prev) => {
        const profilesMap = ((prev as any).profiles ?? {}) as Record<string, Profile>;
        const scenariosMap = ((prev as any).scenarios ?? {}) as Record<string, Scenario>;
        const selected = { ...((prev as any).selectedProfileByScenario ?? {}) } as Record<string, any>;

        let changed = false;

        for (const sid of Object.keys(scenariosMap)) {
          if (!sid || !isUuidLike(sid)) continue;

          const rawSel = selected[sid];
          const sel = rawSel == null ? "" : String(rawSel);
          if (sel && sel !== "null" && sel !== "undefined") continue; // already selected

          const owned = Object.values(profilesMap)
            .filter((p) => String((p as any)?.scenarioId ?? "") === sid)
            .filter((p) => String((p as any)?.ownerUserId ?? "") === uid)
            .slice()
            .sort((a: any, b: any) => {
              const c = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
              if (c !== 0) return c;
              return String(a.id ?? "").localeCompare(String(b.id ?? ""));
            });

          if (owned.length === 0) continue;

          selected[sid] = String((owned[0] as any).id);
          changed = true;
        }

        if (!changed) return prev as any;
        return { ...(prev as any), selectedProfileByScenario: selected } as any;
      });

      if (nextDb !== (state.db as any)) {
        setState({ isReady: true, db: nextDb as any });
        // If some profile owners are missing from the users map, try fetching them from the backend
        try {
          const profilesMap = nextDb?.profiles ?? {};
          const usersMap = nextDb?.users ?? {};
          const missingOwners = new Set<string>();
          for (const p of Object.values(profilesMap)) {
            const ownerId = String((p as any)?.ownerUserId ?? "").trim();
            if (!ownerId) continue;
            if (!usersMap || !usersMap[ownerId]) missingOwners.add(ownerId);
          }

          if (missingOwners.size > 0) {
            const ids = Array.from(missingOwners);
            try {
              const res2 = await apiFetch({ path: `/users?ids=${encodeURIComponent(ids.join(","))}`, token });
              if (res2.ok && Array.isArray(res2.json?.users)) {
                const fetched = res2.json.users as any[];
                if (fetched.length > 0) {
                  const nextDb2 = await updateDb((prev) => {
                    const users2 = { ...((prev as any).users ?? {}) } as any;
                    for (const u of fetched) {
                      const id = String(u?.id ?? "").trim();
                      if (!id) continue;
                      const existingUser = users2[id] ?? {};
                      users2[id] = {
                        ...(existingUser ?? {}),
                        id,
                        username: String(u?.username ?? existingUser?.username ?? ""),
                        avatarUrl: String(u?.avatarUrl ?? u?.avatar_url ?? existingUser?.avatarUrl ?? ""),
                        createdAt: existingUser?.createdAt ?? new Date().toISOString(),
                      } as any;
                    }
                    return { ...(prev as any), users: users2 } as any;
                  });
                  setState({ isReady: true, db: nextDb2 as any });
                }
              }
            } catch {
              // best-effort: ignore failures fetching missing users
            }
          }
        } catch {
          // ignore
        }
      }
    })()
      .catch(() => {
        // ignore
      })
      .finally(() => {
        autoSelectFirstProfileRef.current.inFlight = false;
      });
  }, [state.isReady, state.db, auth.isReady, auth.userId, auth.token, isBackendMode, isUuidLike]);

  // When backend mode is enabled, remove seeded/local-only rows so they never show up.
  // Local DB still acts as a cache of server data.
  const purgedLocalRef = React.useRef(false);
  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    const token = String(auth.token ?? "").trim();
    if (!isBackendMode(token)) return;
    if (purgedLocalRef.current) return;
    purgedLocalRef.current = true;

    (async () => {
      const nextDb = await updateDb((prev) => {
        const users: any = {};
        for (const [id, u] of Object.entries((prev as any).users ?? {})) {
          if (isUuidLike(id)) users[id] = u;
        }

        const scenarios: any = {};
        for (const [id, s] of Object.entries((prev as any).scenarios ?? {})) {
          if (isUuidLike(id)) scenarios[id] = s;
        }

        const profiles: any = {};
        for (const [id, p] of Object.entries((prev as any).profiles ?? {})) {
          if (isUuidLike(id) && isUuidLike(String((p as any)?.scenarioId ?? ""))) profiles[id] = p;
        }

        const posts: any = {};
        for (const [id, p] of Object.entries((prev as any).posts ?? {})) {
          // server post ids may be non-uuid; keep only posts that belong to server scenarios
          if (isUuidLike(String((p as any)?.scenarioId ?? ""))) posts[id] = p;
        }

        const selectedProfileByScenario: any = { ...((prev as any).selectedProfileByScenario ?? {}) };
        for (const [sid, sel] of Object.entries(selectedProfileByScenario)) {
          const pid = sel == null ? "" : String(sel);
          if (!pid || pid === "null" || pid === "undefined") continue;
          // In backend mode, scenario ids are uuids; selected profile ids must also be uuids and exist.
          if (!isUuidLike(String(sid)) || !isUuidLike(pid)) {
            delete selectedProfileByScenario[sid];
            continue;
          }
          const prof = (prev as any).profiles?.[pid];
          if (!prof || String((prof as any)?.scenarioId ?? "") !== String(sid)) {
            delete selectedProfileByScenario[sid];
          }
        }

        return {
          ...prev,
          users,
          scenarios,
          profiles,
          posts,
          selectedProfileByScenario,
        } as any;
      });

      setState({ isReady: true, db: nextDb as any });
    })().catch(() => {
      // ignore
    });
  }, [state.isReady, state.db, auth.isReady, auth.token, isBackendMode, isUuidLike]);

  const scenariosSyncRef = React.useRef<{ token: string | null; inFlight: boolean }>({
    token: null,
    inFlight: false,
  });

  const profilesSyncRef = React.useRef<{
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
  }>({
    inFlightByScenario: {},
    lastSyncAtByScenario: {},
  });

  const serverSeenPostsRef = React.useRef<{ byScenario: Record<string, Record<string, true>> }>({ byScenario: {} });

  const postsSyncRef = React.useRef<{
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
  }>({
    inFlightByScenario: {},
    lastSyncAtByScenario: {},
  });

  const conversationsSyncRef = React.useRef<{
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
  }>({
    inFlightByScenario: {},
    lastSyncAtByScenario: {},
  });

  // WebSocket connections for realtime.
  const wsConnectionsRef = React.useRef<Record<string, WebSocket | null>>({});

  const messagesSyncRef = React.useRef<{
    inFlightByConversation: Record<string, boolean>;
    lastSyncAtByConversation: Record<string, number>;
  }>({
    inFlightByConversation: {},
    lastSyncAtByConversation: {},
  });

  // If backend auth is enabled, fetch scenarios from server and merge into local DB.
  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    const token = String(auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (!token || !baseUrl) return;

    if (scenariosSyncRef.current.inFlight) return;
    if (scenariosSyncRef.current.token === token) return; // already synced for this session token

    scenariosSyncRef.current.inFlight = true;

    (async () => {
      const [res, tagsRes] = await Promise.all([
        apiFetch({ path: "/scenarios", token }),
        apiFetch({ path: "/global-tags", token }),
      ]);
      if (!res.ok || !Array.isArray(res.json)) return;

      const rows = res.json as any[];
      const globalTagRows = tagsRes.ok && Array.isArray(tagsRes.json) ? (tagsRes.json as any[]) : [];
      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const nextScenarios = { ...(prev.scenarios ?? {}) } as any;
        const nextTags = { ...((prev as any).tags ?? {}) } as Record<string, GlobalTag>;

        for (const t of globalTagRows) {
          const key = String(t?.key ?? "").trim().toLowerCase();
          if (!key) continue;
          nextTags[key] = {
            key,
            name: String(t?.name ?? key),
            color: String(t?.color ?? "#000"),
            createdAt: t?.createdAt
              ? new Date(t.createdAt).toISOString()
              : t?.created_at
                ? new Date(t.created_at).toISOString()
                : (nextTags[key]?.createdAt ?? now),
            updatedAt: t?.updatedAt
              ? new Date(t.updatedAt).toISOString()
              : t?.updated_at
                ? new Date(t.updated_at).toISOString()
                : nextTags[key]?.updatedAt,
          };
        }

        for (const raw of rows) {
          const id = String(raw?.id ?? "").trim();
          if (!id) continue;

          const existing = (prev.scenarios as any)?.[id];

          const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
          const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String) : [];

          const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
          const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

          const settings = raw?.settings != null ? raw.settings : undefined;

          nextScenarios[id] = {
            ...(existing ?? {}),
            id,
            name: String(raw?.name ?? existing?.name ?? ""),
            cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
            inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
            ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
            description: raw?.description != null ? String(raw.description) : existing?.description,
            mode: (raw?.mode === "campaign" || raw?.mode === "story") ? raw.mode : (existing?.mode ?? "story"),
            playerIds: playerIds.length > 0 ? playerIds : (existing?.playerIds ?? []),
            tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
            gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
            settings: settings ?? (existing as any)?.settings,
            createdAt: raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : (existing?.createdAt ?? now),
            updatedAt: raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : now,
          } as any;
        }

        return {
          ...prev,
          scenarios: nextScenarios,
          tags: nextTags,
        };
      });

      setState({ isReady: true, db: nextDb as any });
      scenariosSyncRef.current.token = token;
    })()
      .catch(() => {
        // ignore
      })
      .finally(() => {
        scenariosSyncRef.current.inFlight = false;
      });
  }, [state.isReady, state.db, auth.isReady, auth.token]);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      try {
        // clear any other resources
        // Close any websocket connections
        try {
          const conns = Object.values(wsConnectionsRef.current ?? {});
          for (const c of conns) {
            try {
              c?.close?.();
            } catch {}
          }
        } catch {}
      } catch {
        // ignore
      }
    };
  }, []);

  const importPickCacheRef = React.useRef<null | {
    pickedAtMs: number;
    raw: any;
    jsonBytes: number;
    fileName?: string;
    uri?: string;
  }>(null);

  const api = React.useMemo<AppDataApi>(() => {
    const backendEnabled = isBackendMode(auth.token);

    const syncProfilesForScenarioImpl = async (scenarioId: string) => {
      const sid = String(scenarioId ?? "").trim();

      if (!backendEnabled) return;
      if (!sid || !isUuidLike(sid)) return;
      if (!auth.isReady) return;
      if (!state.isReady || !state.db) return;

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return;

      const nowMs = Date.now();
      const lastAt = profilesSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
      const inFlight = Boolean(profilesSyncRef.current.inFlightByScenario[sid]);

      if (inFlight) return;
      if (nowMs - lastAt < 5_000) return;

      profilesSyncRef.current.inFlightByScenario[sid] = true;
      profilesSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

      try {
        const [profilesRes, sheetsRes] = await Promise.all([
          apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/profiles`,
            token,
          }),
          apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/character-sheets`,
            token,
          }),
        ]);

        if (!profilesRes.ok || !Array.isArray(profilesRes.json)) return;
        const rows = profilesRes.json as any[];
        const sheetRows = sheetsRes.ok && Array.isArray(sheetsRes.json) ? (sheetsRes.json as any[]) : [];
        const now = new Date().toISOString();

        const nextDb = await updateDb((prev) => {
          const profiles = { ...(prev.profiles ?? {}) } as any;
          const users = { ...((prev as any).users ?? {}) } as any;
          const sheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;

          const seen = new Set<string>();

          for (const raw of rows) {
            const id = String(raw?.id ?? "").trim();
            if (!id) continue;
            seen.add(id);

            const existing = profiles[id] ?? {};

            profiles[id] = {
              ...existing,
              id,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
              ownerUserId: String(raw?.ownerUserId ?? raw?.owner_user_id ?? ""),
              displayName: String(raw?.displayName ?? raw?.display_name ?? existing?.displayName ?? ""),
              handle: String(raw?.handle ?? existing?.handle ?? ""),
              avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? existing?.avatarUrl ?? ""),
              headerUrl: raw?.headerUrl ?? raw?.header_url ?? existing?.headerUrl,
              bio: raw?.bio ?? existing?.bio,
              isPublic: raw?.isPublic ?? raw?.is_public ?? existing?.isPublic,
              isPrivate: raw?.isPrivate ?? raw?.is_private ?? existing?.isPrivate,
              joinedDate: raw?.joinedDate ?? raw?.joined_date ?? existing?.joinedDate,
              location: raw?.location ?? existing?.location,
              link: raw?.link ?? existing?.link,
              followerCount: raw?.followerCount ?? raw?.follower_count ?? existing?.followerCount,
              followingCount: raw?.followingCount ?? raw?.following_count ?? existing?.followingCount,
              createdAt: raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : raw?.created_at
                  ? new Date(raw.created_at).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,
            } as any;

            // If the backend included owner/user info inline, upsert into users map
            try {
              const ownerId = String(
                raw?.owner?.id ?? raw?.owner_id ?? raw?.ownerUserId ?? raw?.owner_user_id ?? ""
              ).trim();
              if (ownerId) {
                const existingUser = users[ownerId] ?? {};
                const ownerUsername = (
                  raw?.owner?.username ?? raw?.owner_username ?? raw?.owner?.displayName ?? raw?.owner_display_name ?? raw?.owner?.name ?? raw?.owner_name ?? existingUser?.username ?? ""
                ) as string;
                const ownerAvatar = (
                  raw?.owner?.avatarUrl ?? raw?.owner?.avatar_url ?? raw?.owner_avatar_url ?? existingUser?.avatarUrl ?? ""
                ) as string;

                const firstNonEmpty = (...vals: any[]) => {
                  for (const v of vals) {
                    if (v == null) continue;
                    const s = String(v).trim();
                    if (s) return s;
                  }
                  return null;
                };

                const username =
                  firstNonEmpty(
                    ownerUsername,
                    raw?.owner?.handle,
                    raw?.owner?.email ? String(raw.owner.email).split("@")[0] : null,
                    ownerId
                  ) ?? ownerId;

                users[ownerId] = {
                  ...(existingUser ?? {}),
                  id: ownerId,
                  username: String(username),
                  avatarUrl: String(ownerAvatar ?? ""),
                  createdAt: existingUser?.createdAt ?? new Date().toISOString(),
                } as any;
              }
            } catch {
              // ignore owner upsert failures
            }
          }

          // Remove profiles for this scenario that are no longer on server.
          for (const [id, p] of Object.entries(profiles)) {
            if (String((p as any)?.scenarioId ?? "") !== sid) continue;
            if (seen.has(String(id))) continue;
            delete (profiles as any)[id];
          }

          // Replace sheets for this scenario (server is source of truth in backend mode).
          for (const k of Object.keys(sheets)) {
            const existing = (sheets as any)[k];
            if (String((existing as any)?.scenarioId ?? "") === sid) delete (sheets as any)[k];
          }

          for (const raw of sheetRows) {
            const profileId = String(raw?.profileId ?? raw?.profile_id ?? "").trim();
            if (!profileId) continue;

            const scenarioId2 = String(raw?.scenarioId ?? raw?.scenario_id ?? sid).trim();
            if (scenarioId2 !== sid) continue;

            const statsRaw = raw?.stats ?? {};
            const hpRaw = raw?.hp ?? {};

            const existing = (sheets as any)[profileId] ?? {};

            (sheets as any)[profileId] = {
              ...existing,
              profileId,
              scenarioId: scenarioId2,
              name: raw?.name ?? existing?.name,
              race: raw?.race ?? existing?.race,
              class: raw?.class ?? existing?.class,
              level: raw?.level ?? existing?.level,
              alignment: raw?.alignment ?? existing?.alignment,
              background: raw?.background ?? existing?.background,
              stats: {
                strength: Number(statsRaw?.strength ?? (existing as any)?.stats?.strength ?? 10),
                dexterity: Number(statsRaw?.dexterity ?? (existing as any)?.stats?.dexterity ?? 10),
                constitution: Number(statsRaw?.constitution ?? (existing as any)?.stats?.constitution ?? 10),
                intelligence: Number(statsRaw?.intelligence ?? (existing as any)?.stats?.intelligence ?? 10),
                wisdom: Number(statsRaw?.wisdom ?? (existing as any)?.stats?.wisdom ?? 10),
                charisma: Number(statsRaw?.charisma ?? (existing as any)?.stats?.charisma ?? 10),
              },
              hp: {
                current: Number(hpRaw?.current ?? (existing as any)?.hp?.current ?? 10),
                max: Number(hpRaw?.max ?? (existing as any)?.hp?.max ?? 10),
                temp: hpRaw?.temp != null ? Number(hpRaw.temp) : (existing as any)?.hp?.temp,
              },
              status: raw?.status ?? existing?.status,
              inventory: Array.isArray(raw?.inventory) ? raw.inventory : (existing as any)?.inventory ?? [],
              equipment: Array.isArray(raw?.equipment) ? raw.equipment : (existing as any)?.equipment,
              spells: Array.isArray(raw?.spells) ? raw.spells : (existing as any)?.spells,
              abilities: Array.isArray(raw?.abilities) ? raw.abilities : (existing as any)?.abilities,
              publicNotes: raw?.publicNotes ?? raw?.public_notes ?? (existing as any)?.publicNotes,
              privateNotes: raw?.privateNotes ?? raw?.private_notes ?? (existing as any)?.privateNotes,
              createdAt: raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : raw?.created_at
                  ? new Date(raw.created_at).toISOString()
                  : (existing as any)?.createdAt ?? now,
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,
            } as any;
          }

          return { ...(prev as any), profiles, sheets, users } as any;
        });

        setState({ isReady: true, db: nextDb as any });
      } finally {
        profilesSyncRef.current.inFlightByScenario[sid] = false;
      }
    };

    const syncConversationsForScenarioImpl = async (scenarioId: string) => {
      const sid = String(scenarioId ?? "").trim();
      if (!backendEnabled) return;
      if (!sid || !isUuidLike(sid)) return;
      if (!auth.isReady) return;
      if (!state.isReady || !state.db) return;

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return;

      const nowMs = Date.now();
      const lastAt = conversationsSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
      const inFlight = Boolean(conversationsSyncRef.current.inFlightByScenario[sid]);

      // throttle
      if (inFlight) return;
      if (nowMs - lastAt < 5_000) return;

      conversationsSyncRef.current.inFlightByScenario[sid] = true;
      conversationsSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

      try {
        // Get selectedProfileId for this scenario from local state (api helper isn't available yet)
        const selectedProfileId = state.db ? ((state.db as any).selectedProfileByScenario?.[sid] ?? null) : null;
        const query = selectedProfileId ? `?selectedProfileId=${encodeURIComponent(selectedProfileId)}` : "";
        const res = await apiFetch({
          path: `/scenarios/${encodeURIComponent(sid)}/conversations${query}`,
          token,
        });

        const rows = Array.isArray((res.json as any)?.conversations) ? ((res.json as any).conversations as any[]) : null;
        if (!res.ok || !rows) return;

        const now = new Date().toISOString();
        const nextDb = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

          const seen = new Set<string>();

          for (const raw of rows) {
            const id = String(raw?.id ?? "").trim();
            if (!id) continue;
            seen.add(id);

            const existing = conversations[id] ?? {};

            const participantIds = Array.isArray(raw?.participantProfileIds)
              ? raw.participantProfileIds.map(String).map((s: string) => s.trim()).filter(Boolean)
              : Array.isArray(raw?.participant_profile_ids)
                ? raw.participant_profile_ids.map(String).map((s: string) => s.trim()).filter(Boolean)
                : (existing as any)?.participantProfileIds ?? [];

            conversations[id] = {
              ...(existing as any),
              id,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
              title: raw?.title != null ? String(raw.title) : (existing as any)?.title,
              avatarUrl: raw?.avatarUrl != null ? String(raw.avatarUrl) : (raw?.avatar_url != null ? String(raw.avatar_url) : (existing as any)?.avatarUrl),
              participantProfileIds: Array.from(new Set(participantIds)).sort(),
              createdAt: raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : raw?.created_at
                  ? new Date(raw.created_at).toISOString()
                  : (existing as any)?.createdAt ?? now,
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,
              lastMessageAt:
                raw?.lastMessageAt != null
                  ? (raw.lastMessageAt ? new Date(raw.lastMessageAt).toISOString() : undefined)
                  : raw?.last_message_at != null
                    ? (raw.last_message_at ? new Date(raw.last_message_at).toISOString() : undefined)
                    : (existing as any)?.lastMessageAt,
            } as any;
          }

          // Remove conversations for this scenario that are no longer on server.
          for (const [id, c] of Object.entries(conversations)) {
            if (String((c as any).scenarioId ?? "") !== sid) continue;
            if (seen.has(String(id))) continue;
            delete (conversations as any)[id];
            // also drop cached messages for removed conversations
            for (const [mid, m] of Object.entries(messages)) {
              if (String((m as any).scenarioId ?? "") !== sid) continue;
              if (String((m as any).conversationId ?? "") !== String(id)) continue;
              delete (messages as any)[mid];
            }
          }

          return { ...(prev as any), conversations, messages } as any;
        });

        setState({ isReady: true, db: nextDb as any });

        // Prefer WebSocket for realtime updates; fall back to polling if WS not available.
        try {
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          const token = String(auth.token ?? "").trim();
          if (baseUrl && token && typeof WebSocket !== "undefined") {
            const existingWs = wsConnectionsRef.current[sid];
            if (!existingWs) {
              try {
                // Try to include Authorization header where supported (React Native WebSocket
                // supports passing `headers` in the constructor options). If that fails,
                // fall back to passing the token in the query string.
                const wsBase = `${baseUrl.replace(/^http/, "ws")}/realtime/ws?scenarioId=${encodeURIComponent(sid)}`;
                let ws: WebSocket;
                try {
                  // @ts-ignore - some RN/WebSocket typings don't expose the headers option
                  ws = new WebSocket(wsBase, undefined as any, { headers: { Authorization: `Bearer ${token}` } });
                } catch (e) {
                  // Fallback: append token to query string
                  const wsUrlWithToken = `${wsBase}&token=${encodeURIComponent(token)}`;
                  ws = new WebSocket(wsUrlWithToken);
                }
                ws.onopen = () => {
                  // no-op for now
                };
                ws.onmessage = async (ev: any) => {
                  try {
                    const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
                    const evName = String(d?.event ?? "");
                    const payload = d?.payload ?? d?.data ?? null;
                    if (evName === "conversation.created" && payload?.conversation) {
                      api.upsertConversation?.(payload.conversation as any);
                    } else if (evName === "message.created" && payload?.message) {
                      const m = payload.message as any;
                      // upsert message directly
                      updateDb((prev) => {
                        const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
                        const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
                        const mid = String(m.id ?? "");
                        if (!mid) return prev as any;

                        const createdAt = m?.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString();

                        messages[mid] = {
                          id: mid,
                          scenarioId: String(m.scenarioId ?? m.scenario_id ?? sid),
                          conversationId: String(m.conversationId ?? m.conversation_id ?? ""),
                          senderProfileId: String(m.senderProfileId ?? m.sender_profile_id ?? ""),
                          text: String(m.text ?? ""),
                          imageUrls: Array.isArray(m.imageUrls) ? m.imageUrls.map(String).filter(Boolean) : Array.isArray(m.image_urls) ? m.image_urls.map(String).filter(Boolean) : [],
                          createdAt,
                          updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : createdAt,
                          editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : undefined,
                        } as any;

                        const cid = String(messages[mid].conversationId ?? "");
                        const conv = conversations[cid];
                        if (conv && String((conv as any).scenarioId ?? "") === sid) {
                          // Update preview fields for conversation list
                          conversations[cid] = {
                            ...conv,
                            lastMessageAt: createdAt,
                            updatedAt: new Date().toISOString(),
                            lastMessageText: String(m.text ?? ""),
                            lastMessageSenderProfileId: String(m.senderProfileId ?? m.sender_profile_id ?? ""),
                          } as any;
                        }

                        return { ...(prev as any), conversations, messages } as any;
                      }).catch(() => {});
                      // Notify message event subscribers
                        for (const handler of messageEventHandlers) {
                          try { handler(m); } catch {}
                        }

                        // Present a notification when appropriate:
                        try {
                          const mid2 = String(m.id ?? "");
                          const convId = String(m.conversationId ?? m.conversation_id ?? "");

                          // IMPORTANT: use a fresh DB snapshot here (not `state.db`), because
                          // `state` can be stale across platforms/timings and cause iOS/Android
                          // to disagree about whether a conversation is currently being viewed.
                          const dbNow = await readDb();

                          const conv = (dbNow as any)?.conversations?.[convId] ?? null;
                          const viewingConvId = getActiveConversation(sid);
                          const profiles = (dbNow as any)?.profiles ?? {};
                          const selectedProfileId = (dbNow as any)?.selectedProfileByScenario?.[sid] ?? null;

                          // If the user is currently viewing this conversation, mark it read
                          // immediately (best-effort). Do not mutate unread counters here; the
                          // inbox screen uses the server unread endpoint.
                          try {
                            if (viewingConvId && String(viewingConvId) === String(convId) && selectedProfileId) {
                              const tokenLocal = String(auth.token ?? "").trim();
                              if (tokenLocal) {
                                void apiFetch({
                                  path: `/conversations/${encodeURIComponent(convId)}/read`,
                                  token: tokenLocal,
                                  init: {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ profileId: String(selectedProfileId) }),
                                  },
                                }).catch(() => {});
                              }
                            }
                          } catch {}

                          // don't notify for messages missing conversation or when message is from selected profile
                          if (convId && String(m.senderProfileId ?? "") !== String(selectedProfileId ?? "")) {
                            const senderPid = String(m.senderProfileId ?? "");
                            const senderProfile = profiles?.[senderPid] as any;
                            const sendingUserId = String((payload as any)?.senderUserId ?? "").trim();

                            // If the sender profile is owned by the current user, skip notification
                            if (String(senderProfile?.ownerUserId ?? "") === String(currentUserId ?? "")) {
                              // skip notifications for messages that originate from profiles owned by current user
                            } else if (sendingUserId && sendingUserId === String(currentUserId ?? "") && String(selectedProfileId ?? "") === senderPid) {
                              // skip notifications when the current user *sent* the message as the sender profile
                            } else {
                              const participantIds: string[] = Array.isArray(conv?.participantProfileIds)
                                ? (conv as any).participantProfileIds.map(String).filter(Boolean)
                                : [];

                              // Only notify for conversations that include at least one profile owned by the current user.
                              const ownedParticipantIds = participantIds.filter(
                                (pid) => String((profiles?.[pid] as any)?.ownerUserId ?? "") === String(currentUserId ?? "")
                              );

                              // If the user is currently viewing this conversation, skip notification.
                              if (viewingConvId && String(viewingConvId) === String(convId)) {
                                // skip notification when conversation is open
                              } else if (ownedParticipantIds.length > 0) {
                                // Pick the best target profile for navigation (prefer selected profile if it's owned and a participant).
                                const preferred =
                                  selectedProfileId && ownedParticipantIds.includes(String(selectedProfileId))
                                    ? String(selectedProfileId)
                                    : String(ownedParticipantIds[0]);

                                const title = senderProfile?.displayName ? `DM from ${senderProfile.displayName}` : "New message";
                                const body = String(m.text ?? "");
                                const notif = {
                                  id: uuidv4(),
                                  title,
                                  body: body ? (body.length > 140 ? body.slice(0, 137) + "…" : body) : undefined,
                                  scenarioId: sid,
                                  conversationId: convId,
                                  data: { conversationId: convId, scenarioId: sid, profileId: preferred, messageId: mid2 },
                                } as AppNotification;
                                void presentNotification(notif);
                              }
                            }
                          }
                        } catch (e) {
                          // ignore notification errors
                        }
                    } else if (evName === "typing" && payload) {
                      // Notify typing subscribers
                      for (const h of typingEventHandlers) {
                        try { h(payload as any); } catch {}
                      }
                    }
                  } catch (e) {
                    // ignore
                  }
                };
                ws.onclose = () => {
                  try {
                    wsConnectionsRef.current[sid] = null;
                  } catch {}
                };

                wsConnectionsRef.current[sid] = ws;
              } catch (e) {
                // fallback to polling below
              }
            }
          }

          // Polling fallback removed; rely on WebSocket for realtime updates.
        } catch (e) {
          // ignore failures
        }
      } finally {
        conversationsSyncRef.current.inFlightByScenario[sid] = false;
      }
    };

    const syncMessagesForConversationImpl = async (args: { scenarioId: string; conversationId: string; limit?: number }) => {
      const sid = String(args.scenarioId ?? "").trim();
      const cid = String(args.conversationId ?? "").trim();
      const limit = Math.max(1, Math.min(200, Number.isFinite(args.limit as any) ? Number(args.limit) : 200));
      // console.log('[SYNC DEBUG] syncMessagesForConversationImpl called', { scenarioId: sid, conversationId: cid, limit });

      if (!backendEnabled) return;
      if (!sid || !isUuidLike(sid)) return;
      if (!cid || !isUuidLike(cid)) return;
      if (!auth.isReady) return;
      if (!state.isReady || !state.db) return;

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return;

      const key = cid;
      const nowMs = Date.now();
      const lastAt = messagesSyncRef.current.lastSyncAtByConversation[key] ?? 0;
      const inFlight = Boolean(messagesSyncRef.current.inFlightByConversation[key]);

      if (inFlight) return;
      if (nowMs - lastAt < 3_000) return;

      messagesSyncRef.current.inFlightByConversation[key] = true;
      messagesSyncRef.current.lastSyncAtByConversation[key] = nowMs;

      try {
        const res = await apiFetch({
          path: `/conversations/${encodeURIComponent(cid)}/messages?limit=${encodeURIComponent(String(limit))}`,
          token,
        });

        const rows = Array.isArray((res.json as any)?.messages) ? ((res.json as any).messages as any[]) : null;
        if (!res.ok || !rows) return;

        // Debug: log server response message IDs
        // console.log('[SYNC DEBUG] [step1] messages fetched from server', { count: rows?.length, ids: rows?.map(r => r.id) });

        const now = new Date().toISOString();
        const nextDb = await updateDb((prev) => {
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

          // Replace messages for this conversation (server is source of truth).
          for (const [mid, m] of Object.entries(messages)) {
            if (String((m as any).scenarioId ?? "") !== sid) continue;
            if (String((m as any).conversationId ?? "") !== cid) continue;
            delete (messages as any)[mid];
          }

          let lastMessageAt: string | undefined = undefined;

          for (const raw of rows) {
            const id = String(raw?.id ?? "").trim();
            if (!id) continue;

            const createdAt = raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : now;

            messages[id] = {
              id,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
              conversationId: String(raw?.conversationId ?? raw?.conversation_id ?? cid),
              senderProfileId: String(raw?.senderProfileId ?? raw?.sender_profile_id ?? ""),
              kind: String(raw?.kind ?? raw?.kind ?? "text"),
              text: String(raw?.text ?? ""),
              imageUrls: Array.isArray(raw?.imageUrls)
                ? raw.imageUrls.map(String).filter(Boolean)
                : Array.isArray(raw?.image_urls)
                  ? raw.image_urls.map(String).filter(Boolean)
                  : [],
              createdAt,
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : createdAt,
              editedAt: raw?.editedAt
                ? new Date(raw.editedAt).toISOString()
                : raw?.edited_at
                  ? new Date(raw.edited_at).toISOString()
                  : undefined,
            } as any;

            if (!lastMessageAt || createdAt > lastMessageAt) lastMessageAt = createdAt;
          }

          const conv = conversations[cid];
          if (conv && String((conv as any).scenarioId ?? "") === sid) {
            conversations[cid] = { ...conv, lastMessageAt, updatedAt: now } as any;
          }

          // Debug: log after new messages are added to messages map
          // console.log('[SYNC DEBUG] [step2] messages after updateDb', { messageIds: Object.keys(messages) });
          return { ...(prev as any), conversations, messages } as any;
        });

        // Debug: log after setState
        // console.log('[SYNC DEBUG] [step3] setState called with db.messages', { messageIds: Object.keys((nextDb as any)?.messages ?? {}) });

        setState({ isReady: true, db: nextDb as any });
      } finally {
        messagesSyncRef.current.inFlightByConversation[key] = false;
      }
    };

    const schedulePostsSync = (scenarioId: string) => {
      const sid = String(scenarioId ?? "").trim();
      if (!sid) return;
      if (!db) return;
      if (!auth.isReady) return;

      if (backendEnabled && !isUuidLike(sid)) return; // do not sync local-only scenarios in backend mode

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return;

      const nowMs = Date.now();
      const lastAt = postsSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
      const inFlight = Boolean(postsSyncRef.current.inFlightByScenario[sid]);

      // throttle: keep it lightweight (feed calls this often)
      if (inFlight) return;
      if (nowMs - lastAt < 2500) return;

      postsSyncRef.current.inFlightByScenario[sid] = true;
      postsSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

      (async () => {
        const [postsRes, repostsRes, likesRes] = await Promise.all([
          apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/posts`,
            token,
          }),
          apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/reposts`,
            token,
          }),
          apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/likes`,
            token,
          }),
        ]);

        if (!postsRes.ok || !Array.isArray(postsRes.json)) return;

        const rows = postsRes.json as any[];
        const repostRows = repostsRes.ok && Array.isArray(repostsRes.json) ? (repostsRes.json as any[]) : [];
        const likeRows = likesRes.ok && Array.isArray(likesRes.json) ? (likesRes.json as any[]) : [];

        // mark server-seen posts for filtering (server post ids may be non-uuid)
        const seen = (serverSeenPostsRef.current.byScenario[sid] ??= {});
        for (const raw of rows) {
          const id = String(raw?.id ?? "").trim();
          if (id) seen[id] = true;
        }

        const now = new Date().toISOString();

        const nextDb = await updateDb((prev) => {
          const posts = { ...(prev.posts ?? {}) } as any;
          const reposts = { ...((prev as any).reposts ?? {}) } as any;
          const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;

          for (const raw of rows) {
            const id = String(raw?.id ?? "").trim();
            if (!id) continue;

            const existing = posts[id] ?? {};

            posts[id] = {
              ...existing,
              id,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? existing?.scenarioId ?? sid),
              authorProfileId: String(raw?.authorProfileId ?? raw?.author_profile_id ?? existing?.authorProfileId ?? ""),
              text: String(raw?.text ?? existing?.text ?? ""),
              imageUrls: Array.isArray(raw?.imageUrls ?? raw?.image_urls)
                ? (raw?.imageUrls ?? raw?.image_urls).map(String)
                : (existing?.imageUrls ?? []),
              replyCount: Number(raw?.replyCount ?? raw?.reply_count ?? existing?.replyCount ?? 0),
              repostCount: Number(raw?.repostCount ?? raw?.repost_count ?? existing?.repostCount ?? 0),
              likeCount: Number(raw?.likeCount ?? raw?.like_count ?? existing?.likeCount ?? 0),
              parentPostId: raw?.parentPostId ?? raw?.parent_post_id ?? existing?.parentPostId,
              quotedPostId: raw?.quotedPostId ?? raw?.quoted_post_id ?? existing?.quotedPostId,
              insertedAt: raw?.insertedAt
                ? new Date(raw.insertedAt).toISOString()
                : raw?.inserted_at
                  ? new Date(raw.inserted_at).toISOString()
                  : (existing?.insertedAt ?? now),
              createdAt: raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : raw?.created_at
                  ? new Date(raw.created_at).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,

              postType: raw?.postType ?? raw?.post_type ?? existing?.postType,
              meta: raw?.meta ?? existing?.meta,
              isPinned: raw?.isPinned ?? raw?.is_pinned ?? existing?.isPinned,
              pinOrder: raw?.pinOrder ?? raw?.pin_order ?? existing?.pinOrder,
            } as any;
          }

          // Merge repost events for this scenario.
          // Keying matches local convention: `${profileId}|${postId}`.
          for (const r of repostRows) {
            const profileId = String(r?.profileId ?? r?.profile_id ?? "").trim();
            const postId = String(r?.postId ?? r?.post_id ?? "").trim();
            const scenarioId = String(r?.scenarioId ?? r?.scenario_id ?? sid).trim();
            if (!profileId || !postId) continue;
            if (scenarioId !== sid) continue;
            const key = `${profileId}|${postId}`;
            reposts[key] = {
              id: String(r?.id ?? key),
              scenarioId,
              profileId,
              postId,
              createdAt: r?.createdAt
                ? new Date(r.createdAt).toISOString()
                : r?.created_at
                  ? new Date(r.created_at).toISOString()
                  : now,
            } as any;
          }

          // Replace likes for this scenario (server is source of truth in backend mode).
          for (const [k, li] of Object.entries(likes)) {
            if (String((li as any)?.scenarioId ?? "") === sid) {
              delete likes[k];
            }
          }

          for (const li of likeRows) {
            const profileId = String(li?.profileId ?? li?.profile_id ?? "").trim();
            const postId = String(li?.postId ?? li?.post_id ?? "").trim();
            const scenarioId = String(li?.scenarioId ?? li?.scenario_id ?? sid).trim();
            if (!profileId || !postId) continue;
            if (scenarioId !== sid) continue;

            const key = likeKeyV2(sid, profileId, postId);
            likes[key] = {
              id: String(li?.id ?? key),
              scenarioId: sid,
              profileId,
              postId,
              createdAt: li?.createdAt
                ? new Date(li.createdAt).toISOString()
                : li?.created_at
                  ? new Date(li.created_at).toISOString()
                  : now,
            } as any;
          }

          return { ...prev, posts, reposts, likes };
        });

        setState({ isReady: true, db: nextDb as any });
      })()
        .catch(() => {
          // ignore
        })
        .finally(() => {
          postsSyncRef.current.inFlightByScenario[sid] = false;
        });
    };
    const toggleLikePostImpl: AppDataApi["toggleLikePost"] = async (scenarioId, profileId, postId) => {
      const sid = String(scenarioId ?? "").trim();
      const pid = String(profileId ?? "").trim();
      const poid = String(postId ?? "").trim();
      if (!sid || !pid || !poid) {
        return { ok: false, liked: false };
      }

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (token && baseUrl) {
        // backend mode
        const likesMap = getLikesMap(db);
        const k2 = likeKeyV2(sid, pid, poid);
        const k1 = likeKeyV1(pid, poid);
        const already =
          Boolean(likesMap[k2]) ||
          (Boolean(likesMap[k1]) && String((likesMap[k1] as any)?.scenarioId ?? "") === sid);

        const res = await apiFetch({
          path: `/likes/posts/${encodeURIComponent(poid)}`,
          token,
          init: {
            method: already ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioId: sid, profileId: pid }),
          },
        });

        if (!res.ok) {
          const msg =
            typeof (res.json as any)?.error === "string"
              ? String((res.json as any).error)
              : typeof res.text === "string" && res.text.trim().length
                ? res.text
                : `Like failed (HTTP ${res.status})`;
          throw new Error(msg);
        }

        const liked = Boolean((res.json as any)?.liked);
        const post = (res.json as any)?.post;
        const now = new Date().toISOString();

        const nextDb = await updateDb((prev) => {
          const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;
          const posts = { ...(prev as any).posts } as any;

          // Remove any old keys (v1/v2) for this profile+post in this scenario
          const k2 = likeKeyV2(sid, pid, poid);
          const k1 = likeKeyV1(pid, poid);
          if (likes[k2]) delete likes[k2];
          if (likes[k1] && String((likes[k1] as any)?.scenarioId ?? "") === sid) delete likes[k1];

          if (liked) {
            likes[k2] = {
              id: String((res.json as any)?.like?.id ?? k2),
              scenarioId: sid,
              profileId: pid,
              postId: poid,
              createdAt: (res.json as any)?.like?.createdAt
                ? new Date((res.json as any).like.createdAt).toISOString()
                : now,
            } as any;
          }

          if (post && typeof post === "object") {
            const existing = posts[poid] ?? {};
            posts[poid] = {
              ...existing,
              ...post,
              id: String(post?.id ?? poid),
              scenarioId: String(post?.scenarioId ?? post?.scenario_id ?? sid),
              authorProfileId: String(post?.authorProfileId ?? post?.author_profile_id ?? existing?.authorProfileId ?? ""),
              text: String(post?.text ?? existing?.text ?? ""),
              imageUrls: Array.isArray(post?.imageUrls ?? post?.image_urls)
                ? (post?.imageUrls ?? post?.image_urls).map(String)
                : (existing?.imageUrls ?? []),
              replyCount: Number(post?.replyCount ?? post?.reply_count ?? existing?.replyCount ?? 0),
              repostCount: Number(post?.repostCount ?? post?.repost_count ?? existing?.repostCount ?? 0),
              likeCount: Number(post?.likeCount ?? post?.like_count ?? existing?.likeCount ?? 0),
              parentPostId: post?.parentPostId ?? post?.parent_post_id ?? existing?.parentPostId,
              quotedPostId: post?.quotedPostId ?? post?.quoted_post_id ?? existing?.quotedPostId,
              insertedAt: post?.insertedAt
                ? new Date(post.insertedAt).toISOString()
                : post?.inserted_at
                  ? new Date(post.inserted_at).toISOString()
                  : (existing?.insertedAt ?? now),
              createdAt: post?.createdAt
                ? new Date(post.createdAt).toISOString()
                : post?.created_at
                  ? new Date(post.created_at).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: post?.updatedAt
                ? new Date(post.updatedAt).toISOString()
                : post?.updated_at
                  ? new Date(post.updated_at).toISOString()
                  : now,
              postType: post?.postType ?? post?.post_type ?? existing?.postType,
              meta: post?.meta ?? existing?.meta,
              isPinned: post?.isPinned ?? post?.is_pinned ?? existing?.isPinned,
              pinOrder: post?.pinOrder ?? post?.pin_order ?? existing?.pinOrder,
            } as any;
          }

          return { ...prev, likes, posts } as any;
        });

        setState({ isReady: true, db: nextDb as any });
        return { ok: true, liked };
      }

      const now = new Date().toISOString();

      const nextDb = await updateDb((prev) => {
        const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;
        const posts = { ...prev.posts };

        const post = posts[poid];
        if (!post) {
          return prev;
        }

        // ✅ ensure callers don't accidentally like across scenarios
        if (String((post as any).scenarioId ?? "") !== sid) {
          return prev;
        }

        const k2 = likeKeyV2(sid, pid, poid);
        const k1 = likeKeyV1(pid, poid);

        const already =
          Boolean(likes[k2]) ||
          (Boolean(likes[k1]) && String((likes[k1] as any)?.scenarioId ?? "") === sid);

        if (likes[k2]) delete likes[k2];
        if (likes[k1] && String((likes[k1] as any)?.scenarioId ?? "") === sid) delete likes[k1];

        if (!already) {
          likes[k2] = {
            id: makeLikeId(),
            scenarioId: sid,
            profileId: pid,
            postId: poid,
            createdAt: now,
          } as Like;
        }

        posts[poid] = {
          ...post,
          likeCount: Math.max(0, Number((post as any).likeCount ?? 0) + (already ? -1 : 1)),
          updatedAt: now,
        } as any;

        return { ...prev, likes, posts };
      });

      setState({ isReady: true, db: nextDb as any });

      const likesMap = (nextDb as any)?.likes ?? {};
      const k2 = likeKeyV2(sid, pid, poid);
      const k1 = likeKeyV1(pid, poid);

      const liked =
        Boolean(likesMap[k2]) ||
        (Boolean(likesMap[k1]) && String(likesMap[k1]?.scenarioId ?? "") === sid);

      return { ok: true, liked };
    };

    return {
      // --- profiles
      getProfileById: (id) => (db ? db.profiles[String(id)] ?? null : null),

      getProfileByHandle: (scenarioId, handle) => {
        if (!db) return null;
        const needle = normalizeHandle(handle);
        for (const p of Object.values(db.profiles)) {
          if (p.scenarioId === String(scenarioId) && normalizeHandle(p.handle) === needle) return p;
        }
        return null;
      },

      listProfilesForScenario: (scenarioId) =>
        {
          const sid = String(scenarioId ?? "").trim();

          // In backend mode, never show local-only scenarios/profiles.
          if (backendEnabled && sid && !isUuidLike(sid)) return [];

          // Fire-and-forget sync from backend.
          if (backendEnabled && sid) {
            syncProfilesForScenarioImpl(sid).catch(() => {
              // ignore
            });
          }

          return db ? Object.values(db.profiles).filter((p) => p.scenarioId === sid) : [];
        },

      // --- posts
      getPostById: (id) => (db ? db.posts[String(id)] ?? null : null),

      listPostsForScenario: (scenarioId) =>
        (() => {
          const sid = String(scenarioId);

          if (backendEnabled && sid && !isUuidLike(sid)) return [];
          schedulePostsSync(sid);

          if (!db) return [];
          let items = Object.values(db.posts).filter((p) => p.scenarioId === sid && !p.parentPostId);

          if (backendEnabled) {
            const seen = serverSeenPostsRef.current.byScenario[sid] ?? {};
            items = items.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
          }

          return items.sort(sortDescByCreatedAtThenId);
        })(),

      listRepliesForPost: (postId) =>
        (() => {
          const poid = String(postId);
          const p = db ? (db.posts as any)?.[poid] : null;
          const sid = String((p as any)?.scenarioId ?? "");
          if (sid) schedulePostsSync(sid);

          if (!db) return [];
          let items = Object.values(db.posts).filter((p) => p.parentPostId === poid);
          if (backendEnabled && sid) {
            const seen = serverSeenPostsRef.current.byScenario[sid] ?? {};
            items = items.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
          }
          return items.sort(sortAscByCreatedAtThenId);
        })(),

      // generic paged posts (feed)
      listPostsPage: ({ scenarioId, limit = 15, cursor, filter, includeReplies = false }) => {
        if (!db) return { items: [], nextCursor: null };

        const sid = String(scenarioId);

        if (backendEnabled && sid && !isUuidLike(sid)) return { items: [], nextCursor: null };
        schedulePostsSync(sid);

        let items = Object.values(db.posts).filter((p) => p.scenarioId === sid);

        if (backendEnabled) {
          const seen = serverSeenPostsRef.current.byScenario[sid] ?? {};
          items = items.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
        }

        if (!includeReplies) items = items.filter((p) => !p.parentPostId);
        if (filter) items = items.filter(filter);

        items.sort(sortDescByCreatedAtThenId);

        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((p) => makePostCursor(p) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makePostCursor(page[page.length - 1]) : null;

        return { items: page, nextCursor: next };
      },

      // profile feed page
      listProfileFeedPage: ({ scenarioId, profileId, tab, limit = 15, cursor }) => {
        if (!db) return { items: [], nextCursor: null };

        const sid = String(scenarioId);
        const pid = String(profileId);

        if (backendEnabled && sid && !isUuidLike(sid)) return { items: [], nextCursor: null };

        const seen = backendEnabled ? (serverSeenPostsRef.current.byScenario[sid] ?? {}) : null;

        let posts = Object.values(db.posts).filter((p) => p.scenarioId === sid);
        if (seen) posts = posts.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
        const authoredPosts = posts.filter((p) => String(p.authorProfileId) === pid);

        const repostEvents = Object.values((db as any).reposts ?? {}).filter(
          (r: any) => String(r.scenarioId) === sid && String(r.profileId) === pid
        );

        const items: ProfileFeedItem[] = [];

        if (tab === "posts") {
          // Track post ids already represented as normal posts on this profile page.
          // This prevents returning the same post twice (post + repost) which breaks
          // your UI because ProfileScreen maps feed items -> it.post (FlatList key = post.id).
          const authoredPostIds = new Set<string>();

          for (const p of authoredPosts.filter((p) => !p.parentPostId)) {
            const postId = String(p.id);
            authoredPostIds.add(postId);

            items.push({
              kind: "post",
              post: p,
              activityAt: String(p.createdAt),
            });
          }

          for (const r of repostEvents) {
            const post = db.posts[String((r as any).postId)];
            if (!post) continue;
            if (post.parentPostId) continue;

            // allow reposting your own post in the DB,
            // but DO NOT return it as a separate feed item (avoids duplicate post.id rows)
            if (String(post.authorProfileId) === pid) continue;

            // extra safety: if somehow the post is already represented, don't duplicate it
            if (authoredPostIds.has(String(post.id))) continue;

            items.push({
              kind: "repost",
              post,
              activityAt: String((r as any).createdAt),
              reposterProfileId: pid,
            });
          }
        }

        if (tab === "media") {
          for (const p of authoredPosts.filter((p) => !p.parentPostId && hasAnyMedia(p))) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        if (tab === "replies") {
          for (const p of authoredPosts.filter((p) => !!p.parentPostId)) {
            items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
          }
        }

        if (tab === "likes") {
          const likeEvents = Object.values(getLikesMap(db))
            .filter((v) => String((v as any).scenarioId) === String(scenarioId) && String((v as any).profileId) === String(profileId))
            .sort((a: any, b: any) => {
              const c = String(b.createdAt).localeCompare(String(a.createdAt));
              if (c !== 0) return c;
              return String(b.postId).localeCompare(String(a.postId));
            });

          for (const li of likeEvents) {
            const post = db.posts[String((li as any).postId)];
            if (!post) continue;
            items.push({
              kind: "post",
              post,
              activityAt: String((li as any).createdAt),
            });
          }
        }

        items.sort((a, b) => {
          const c = String(b.activityAt).localeCompare(String(a.activityAt));
          if (c !== 0) return c;
          const k = String(b.kind).localeCompare(String(a.kind));
          if (k !== 0) return k;
          return String(b.post.id).localeCompare(String(a.post.id));
        });

        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((it) => makeFeedCursor(it) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makeFeedCursor(page[page.length - 1]) : null;

        return { items: page, nextCursor: next };
      },

      // --- selection
      getSelectedProfileId: (scenarioId) => {
        if (!db) return null;
        const raw = (db as any).selectedProfileByScenario?.[String(scenarioId)] ?? null;
        if (raw == null) return null;
        const v = String(raw);
        if (!v || v === "null" || v === "undefined") return null;

        // Ensure the selected profile actually exists and belongs to this scenario.
        const profile = (db as any)?.profiles?.[v];
        if (!profile) return null;
        if (String((profile as any)?.scenarioId ?? "") !== String(scenarioId)) return null;

        // In backend mode, selected profile ids must be server uuids.
        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl && !isUuidLike(v)) return null;
        return v;
      },

      // --- actions
      setSelectedProfileId: async (scenarioId, profileId) => {
        const sid = String(scenarioId);
        const pid = profileId == null ? null : String(profileId);
        const next = await updateDb((prev) => ({
          ...prev,
          selectedProfileByScenario: {
            ...(prev as any).selectedProfileByScenario,
            [sid]: pid,
          },
        }));
        setState({ isReady: true, db: next as any });
      },

      upsertProfile: async (p) => {
        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();

        // Backend mode
        if (token && baseUrl) {
          const sid = String((p as any)?.scenarioId ?? "").trim();
          const now = new Date().toISOString();
          if (!sid) throw new Error("scenarioId is required");

          if (!isUuidLike(sid)) throw new Error("Invalid scenarioId for backend mode");

          const idRaw = String((p as any)?.id ?? "").trim();

          // Only treat as existing if this looks like a server profile id.
          // This prevents accidental PATCH to /profiles/profile_<date>... when the UI created a local temp id.
          const existing = idRaw && isUuidLike(idRaw) ? db?.profiles?.[idRaw] : undefined;

          const rawAvatar = (p as any)?.avatarUrl != null ? String((p as any).avatarUrl) : "";
          const rawHeader = (p as any)?.headerUrl != null ? String((p as any).headerUrl) : "";
          const avatarIsLocal = !!rawAvatar && !/^https?:\/\//i.test(rawAvatar);
          const headerIsLocal = !!rawHeader && !/^https?:\/\//i.test(rawHeader);

          // Never send local file URIs to the backend (they'd get stored in Neon).
          // Instead, create/update first, then upload via /profiles/:id/avatar|header.
          const body = {
            displayName: (p as any)?.displayName,
            handle: (p as any)?.handle,
            avatarUrl: avatarIsLocal ? undefined : (p as any)?.avatarUrl,
            headerUrl: headerIsLocal ? undefined : (p as any)?.headerUrl,
            bio: (p as any)?.bio,
            isPublic: (p as any)?.isPublic,
            isPrivate: (p as any)?.isPrivate,
            joinedDate: (p as any)?.joinedDate,
            location: (p as any)?.location,
            link: (p as any)?.link,
            followerCount: (p as any)?.followerCount,
            followingCount: (p as any)?.followingCount,
          };

          const res = await apiFetch({
            path: existing ? `/profiles/${encodeURIComponent(idRaw)}` : `/scenarios/${encodeURIComponent(sid)}/profiles`,
            token,
            init: {
              method: existing ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Save failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          let raw = (res.json as any)?.profile;
          if (!raw) throw new Error("Invalid server response");

          const serverId = String(raw?.id ?? "").trim();
          if (!serverId) throw new Error("Invalid server response");

          // Upload avatar/header if they were selected as local files.
          if (avatarIsLocal) {
            const form = new FormData();
            const name = `profile_avatar_${serverId}_${Date.now()}.jpg`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.append("avatar", { uri: rawAvatar, name, type: "image/jpeg" } as any);

            const up = await apiFetch({
              path: `/profiles/${encodeURIComponent(serverId)}/avatar`,
              token,
              init: { method: "POST", body: form as any },
            });

            if (!up.ok) {
              const msg =
                typeof (up.json as any)?.error === "string"
                  ? String((up.json as any).error)
                  : typeof up.text === "string" && up.text.trim().length
                    ? up.text
                    : `Avatar upload failed (HTTP ${up.status})`;
              throw new Error(msg);
            }

            raw = (up.json as any)?.profile ?? raw;
          }

          if (headerIsLocal) {
            const form = new FormData();
            const name = `profile_header_${serverId}_${Date.now()}.jpg`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.append("header", { uri: rawHeader, name, type: "image/jpeg" } as any);

            const up = await apiFetch({
              path: `/profiles/${encodeURIComponent(serverId)}/header`,
              token,
              init: { method: "POST", body: form as any },
            });

            if (!up.ok) {
              const msg =
                typeof (up.json as any)?.error === "string"
                  ? String((up.json as any).error)
                  : typeof up.text === "string" && up.text.trim().length
                    ? up.text
                    : `Header upload failed (HTTP ${up.status})`;
              throw new Error(msg);
            }

            raw = (up.json as any)?.profile ?? raw;
          }

          const nextDb = await updateDb((prev) => {
            const profiles = { ...(prev.profiles ?? {}) } as any;

            // If we had a local non-server id, avoid keeping duplicates.
            if (idRaw && idRaw !== serverId && profiles[idRaw] && !existing) {
              delete profiles[idRaw];
            }

            const prevRow = profiles[serverId] ?? {};
            const createdAt = raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : (prevRow?.createdAt ?? now);

            profiles[serverId] = {
              ...prevRow,
              id: serverId,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
              ownerUserId: String(raw?.ownerUserId ?? raw?.owner_user_id ?? String((p as any)?.ownerUserId ?? "")),
              displayName: String(raw?.displayName ?? raw?.display_name ?? body.displayName ?? ""),
              handle: String(raw?.handle ?? body.handle ?? ""),
              avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? body.avatarUrl ?? ""),
              headerUrl: raw?.headerUrl ?? raw?.header_url ?? body.headerUrl ?? undefined,
              bio: raw?.bio ?? body.bio ?? undefined,
              isPublic: raw?.isPublic ?? raw?.is_public ?? body.isPublic,
              isPrivate: raw?.isPrivate ?? raw?.is_private ?? body.isPrivate,
              joinedDate: raw?.joinedDate ?? raw?.joined_date ?? body.joinedDate ?? createdAt,
              location: raw?.location ?? body.location ?? undefined,
              link: raw?.link ?? body.link ?? undefined,
              followerCount: raw?.followerCount ?? raw?.follower_count ?? body.followerCount,
              followingCount: raw?.followingCount ?? raw?.following_count ?? body.followingCount,
              createdAt,
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,
            } as any;

            return { ...prev, profiles };
          });

          setState({ isReady: true, db: nextDb as any });
          return;
        }

        // Local mode
        const id = String(p.id);
        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const existing = prev.profiles[id];
          const createdAt = (existing as any)?.createdAt ?? (p as any).createdAt ?? now;

          return {
            ...prev,
            profiles: {
              ...prev.profiles,
              [id]: {
                ...(existing ?? {}),
                ...p,
                id,
                createdAt,
                joinedDate: (p as any).joinedDate ?? (existing as any)?.joinedDate ?? createdAt,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      deleteProfileCascade: async (scenarioId: string, profileId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const pid = String(profileId ?? "").trim();
        if (!sid) return { ok: false, error: "scenarioId is required" };
        if (!pid) return { ok: false, error: "profileId is required" };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/profiles/${encodeURIComponent(pid)}`,
            token,
            init: { method: "DELETE" },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Delete failed (HTTP ${res.status})`;
            return { ok: false, error: msg };
          }
        }

        const now = new Date().toISOString();

        const nextDb = await updateDb((prev) => {
          const existing = prev.profiles?.[pid] as any;
          if (!existing) return prev;
          if (String(existing.scenarioId ?? "") !== sid) return prev;

          const profiles = { ...prev.profiles } as any;
          const posts = { ...prev.posts } as any;
          const reposts = { ...((prev as any).reposts ?? {}) } as any;
          const sheets = { ...((prev as any).sheets ?? {}) } as any;
          const likes = { ...((prev as any).likes ?? {}) } as Record<string, Like>;

          const deletedPostIds = new Set<string>();
          for (const k of Object.keys(posts)) {
            const p = posts[k];
            if (String(p?.authorProfileId ?? "") === pid) {
              deletedPostIds.add(String(k));
              delete posts[k];
            }
          }

          // 2) Remove likes made by this profile + decrement likeCount for remaining posts
          for (const k of Object.keys(likes)) {
            const li = likes[k];
            if (String((li as any)?.profileId ?? "") !== pid) continue;

            const likedPostId = String((li as any)?.postId ?? "");
            if (likedPostId && !deletedPostIds.has(likedPostId)) {
              const post = posts[likedPostId];
              if (post) {
                posts[likedPostId] = {
                  ...post,
                  likeCount: Math.max(0, Number((post as any).likeCount ?? 0) - 1),
                  updatedAt: now,
                };
              }
            }

            delete likes[k];
          }

          // remove likes referencing posts we deleted (from anyone)
          if (deletedPostIds.size > 0) {
            for (const k of Object.keys(likes)) {
              const li = likes[k];
              if (deletedPostIds.has(String((li as any)?.postId ?? ""))) delete likes[k];
            }
          }

          // 3) Remove reposts made by this profile and adjust repost counts for remaining posts
          const repostedPostIdsByThisProfile = new Set<string>();
          for (const k of Object.keys(reposts)) {
            const r = reposts[k];
            if (String(r?.profileId ?? "") === pid) {
              repostedPostIdsByThisProfile.add(String(r?.postId ?? ""));
              delete reposts[k];
            }
          }
          for (const repostedPostId of repostedPostIdsByThisProfile) {
            if (!repostedPostId) continue;
            if (deletedPostIds.has(repostedPostId)) continue;
            const post = posts[repostedPostId];
            if (!post) continue;
            posts[repostedPostId] = {
              ...post,
              repostCount: Math.max(0, Number((post as any).repostCount ?? 0) - 1),
              updatedAt: now,
            };
          }

          // 4) Remove any reposts referencing posts we deleted
          for (const k of Object.keys(reposts)) {
            const r = reposts[k];
            const targetPostId = String(r?.postId ?? "");
            if (deletedPostIds.has(targetPostId)) delete reposts[k];
          }

          // 6) Remove from pinned list for this scenario
          const scenarios = { ...prev.scenarios } as any;
          const scenario = scenarios[sid];
          if (scenario && deletedPostIds.size > 0) {
            const prevSettings = (((scenario as any).settings ?? {}) as Record<string, any>);
            const prevPinned = Array.isArray(prevSettings.pinnedPostIds)
              ? prevSettings.pinnedPostIds.map(String).filter(Boolean)
              : [];

            const nextPinned = prevPinned.filter((id: string) => !deletedPostIds.has(String(id)));
            if (nextPinned.length !== prevPinned.length) {
              scenarios[sid] = {
                ...scenario,
                settings: { ...prevSettings, pinnedPostIds: nextPinned },
                updatedAt: now,
              };
            }
          }

          // 7) Remove character sheet for this profile
          if (sheets[pid]) delete sheets[pid];

          // 8) Remove profile itself
          delete profiles[pid];

          // 9) If selected profile is deleted, clear it
          const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
          if (String(selectedProfileByScenario?.[sid] ?? "") === pid) {
            selectedProfileByScenario[sid] = null;
          }

          return {
            ...prev,
            profiles,
            posts,
            reposts,
            sheets,
            likes,
            scenarios,
            selectedProfileByScenario,
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return { ok: true };
      },

      upsertPost: async (p) => {
        const id = String((p as any).id);
        const now = new Date().toISOString();

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        const sid = String((p as any)?.scenarioId ?? "").trim();
        if (token && baseUrl && sid) {
          if (!isUuidLike(sid)) throw new Error("Invalid scenarioId for backend mode");

          // Backend requires author_profile_id to be a UUID (profiles.id).
          const rawAuthor = String((p as any)?.authorProfileId ?? "").trim();
          let authorProfileId = rawAuthor;
          if (!isUuidLike(authorProfileId)) {
            const selRaw = (db as any)?.selectedProfileByScenario?.[sid];
            const sel = selRaw == null ? "" : String(selRaw);
            if (sel && isUuidLike(sel) && (db as any)?.profiles?.[sel] && String((db as any).profiles[sel]?.scenarioId ?? "") === sid) {
              authorProfileId = sel;
            } else {
              const owned = Object.values((db as any)?.profiles ?? {}).find(
                (pr: any) =>
                  String(pr?.scenarioId ?? "") === sid &&
                  String(pr?.ownerUserId ?? "") === currentUserId &&
                  isUuidLike(String(pr?.id ?? "")),
              ) as any;
              authorProfileId = owned?.id ? String(owned.id) : "";
            }
          }
          if (!authorProfileId || !isUuidLike(authorProfileId)) {
            throw new Error("Pick a valid profile before posting.");
          }

          const rawImageUrls = Array.isArray((p as any)?.imageUrls) ? (p as any).imageUrls.map(String).filter(Boolean) : [];
          const localImageUris = rawImageUrls.filter((u: string) => !/^https?:\/\//i.test(u));
          const remoteImageUrls = rawImageUrls.filter((u: string) => /^https?:\/\//i.test(u));

          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/posts`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id,
                authorProfileId,
                text: (p as any)?.text,
                imageUrls: remoteImageUrls,
                replyCount: (p as any)?.replyCount,
                repostCount: (p as any)?.repostCount,
                likeCount: (p as any)?.likeCount,
                parentPostId: (p as any)?.parentPostId,
                quotedPostId: (p as any)?.quotedPostId,
                insertedAt: (p as any)?.insertedAt,
                createdAt: (p as any)?.createdAt,
                postType: (p as any)?.postType,
                meta: (p as any)?.meta,
                isPinned: (p as any)?.isPinned,
                pinOrder: (p as any)?.pinOrder,
              }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Save failed (HTTP ${res.status})`;
            throw new Error(msg);
          } else {
            let raw = (res.json as any)?.post;
            if (raw) {
              const postId = String(raw?.id ?? id);
              if (sid) {
                const seen = (serverSeenPostsRef.current.byScenario[sid] ??= {});
                if (postId) seen[postId] = true;
              }

              // If there are local images, upload them to R2 and persist returned URLs in Neon.
              if (postId && localImageUris.length > 0) {
                const form = new FormData();
                for (let i = 0; i < localImageUris.length; i++) {
                  const uri = String(localImageUris[i]);
                  const name = `post_${postId}_${i}_${Date.now()}.jpg`;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  form.append("images", { uri, name, type: "image/jpeg" } as any);
                }

                const up = await apiFetch({
                  path: `/posts/${encodeURIComponent(postId)}/images`,
                  token,
                  init: {
                    method: "POST",
                    body: form as any,
                  },
                });

                if (!up.ok) {
                  const msg =
                    typeof (up.json as any)?.error === "string"
                      ? String((up.json as any).error)
                      : typeof up.text === "string" && up.text.trim().length
                        ? up.text
                        : `Upload failed (HTTP ${up.status})`;
                  throw new Error(msg);
                }

                raw = (up.json as any)?.post ?? raw;
              }

              const nextDb = await updateDb((prev) => {
                const posts = { ...(prev.posts ?? {}) } as any;
                const existing = posts[postId] ?? {};
                posts[postId] = {
                  ...existing,
                  ...p,
                  id: postId,
                  scenarioId: String(raw?.scenarioId ?? (p as any)?.scenarioId ?? sid),
                  authorProfileId: String(raw?.authorProfileId ?? (p as any)?.authorProfileId ?? ""),
                  text: String(raw?.text ?? (p as any)?.text ?? ""),
                  imageUrls: Array.isArray(raw?.imageUrls)
                    ? raw.imageUrls.map(String)
                    : Array.isArray((p as any)?.imageUrls)
                      ? (p as any).imageUrls.map(String).filter(Boolean)
                      : [],
                  replyCount: Number(raw?.replyCount ?? (p as any)?.replyCount ?? 0),
                  repostCount: Number(raw?.repostCount ?? (p as any)?.repostCount ?? 0),
                  likeCount: Number(raw?.likeCount ?? (p as any)?.likeCount ?? 0),
                  parentPostId: raw?.parentPostId ?? (p as any)?.parentPostId,
                  quotedPostId: raw?.quotedPostId ?? (p as any)?.quotedPostId,
                  insertedAt: raw?.insertedAt ? new Date(raw.insertedAt).toISOString() : ((p as any)?.insertedAt ?? now),
                  createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : ((p as any)?.createdAt ?? now),
                  updatedAt: raw?.updatedAt ? new Date(raw.updatedAt).toISOString() : now,
                  postType: raw?.postType ?? (p as any)?.postType,
                  meta: raw?.meta ?? (p as any)?.meta,
                  isPinned: raw?.isPinned ?? (p as any)?.isPinned,
                  pinOrder: raw?.pinOrder ?? (p as any)?.pinOrder,
                } as any;

                return { ...prev, posts };
              });

              setState({ isReady: true, db: nextDb as any });
              return;
            }
          }
        }

        const next = await updateDb((prev) => {
          const existing = prev.posts[id];

          const insertedAt = (existing as any)?.insertedAt ?? (p as any).insertedAt ?? now;
          const createdAt = (p as any).createdAt ?? (existing as any)?.createdAt ?? now;

          return {
            ...prev,
            posts: {
              ...prev.posts,
              [id]: {
                ...(existing ?? {}),
                ...p,
                id,
                insertedAt,
                createdAt,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      deletePost: async (postId) => {
        const id = String(postId);

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          await apiFetch({
            path: `/posts/${encodeURIComponent(id)}`,
            token,
            init: { method: "DELETE" },
          }).catch(() => {
            // ignore (offline / server error)
          });
        }

        const next = await updateDb((prev) => {
          if (!prev.posts[id]) return prev;

          const posts = { ...prev.posts };
          delete posts[id];

          const reposts = { ...((prev as any).reposts ?? {}) };
          for (const k of Object.keys(reposts ?? {})) {
            if (String((reposts as any)[k]?.postId) === id) delete reposts[k];
          }

          const likes = { ...((prev as any).likes ?? {}) };
          for (const k of Object.keys(likes ?? {})) {
            if (String((likes as any)[k]?.postId) === id) delete likes[k];
          }

          // also remove from pinned list for its scenario (if present)
          const scenarios = { ...prev.scenarios };
          const removedPostScenarioId = String((prev.posts as any)?.[id]?.scenarioId ?? "");

          if (removedPostScenarioId && scenarios[removedPostScenarioId]) {
            const s = scenarios[removedPostScenarioId];
            const prevSettings = (((s as any).settings ?? {}) as Record<string, any>);
            const prevPinned = Array.isArray(prevSettings.pinnedPostIds)
              ? prevSettings.pinnedPostIds.map(String).filter(Boolean)
              : [];

            if (prevPinned.includes(id)) {
              const nextPinned = prevPinned.filter((x) => x !== id);
              scenarios[removedPostScenarioId] = {
                ...s,
                settings: { ...prevSettings, pinnedPostIds: nextPinned },
                updatedAt: new Date().toISOString(),
              } as any;
            }
          }

          return { ...prev, posts, reposts, likes, scenarios };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- likes (table-backed) ---
      isPostLikedByProfile: (profileId: string, postId: string) => {
        if (!db) return false;
        const pid = String(profileId);
        const poid = String(postId);
        // no scenarioId in signature => scan rows (safe + correct)
        for (const li of Object.values(getLikesMap(db))) {
          if (String((li as any)?.profileId ?? "") !== pid) continue;
          if (String((li as any)?.postId ?? "") !== poid) continue;
          return true;
        }
        return false;
      },

      listLikedPostIdsForProfile: (scenarioId: string, profileId: string) => {
        if (!db) return [];
        const sid = String(scenarioId);
        const pid = String(profileId);

        const out: string[] = [];
        for (const li of Object.values(getLikesMap(db))) {
          if (String((li as any).scenarioId) !== sid) continue;
          if (String((li as any).profileId) !== pid) continue;
          out.push(String((li as any).postId));
        }
        return out;
      },

      isPostLikedBySelectedProfile: (scenarioId, postId) => {
        if (!db) return false;
        const sid = String(scenarioId);
        const selRaw = (db as any).selectedProfileByScenario?.[sid];
        const sel = selRaw == null ? "" : String(selRaw);
        if (!sel || sel === "null" || sel === "undefined") return false;

        const poid = String(postId);
        const likes = getLikesMap(db);

        const k2 = likeKeyV2(sid, sel, poid);
        if (likes[k2]) return true;

        const k1 = likeKeyV1(sel, poid);
        return Boolean(likes[k1]) && String((likes[k1] as any)?.scenarioId ?? "") === sid;
      },

      toggleLikePost: toggleLikePostImpl,

      toggleLike: async (scenarioId, postId) => {
        if (!db) return;
        const sid = String(scenarioId);
        const poid = String(postId);

        const selRaw = (db as any).selectedProfileByScenario?.[sid];
        const sel = selRaw == null ? "" : String(selRaw);
        if (!sel || sel === "null" || sel === "undefined") {
          return;
        }

        await toggleLikePostImpl(sid, sel, poid);
      },
      deleteConversationCascade: async ({ scenarioId, conversationId }) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = String(conversationId ?? "").trim();
        if (!sid || !cid) return;
        if (!db) return;

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) throw new Error("Missing backend auth");
          if (!isUuidLike(sid) || !isUuidLike(cid)) throw new Error("Invalid ids for backend mode");

          const res = await apiFetch({
            path: `/conversations/${encodeURIComponent(cid)}`,
            token,
            init: { method: "DELETE" },
          });
          if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Delete failed");
          // fall through to local deletion so the UI updates immediately.
        }

        const next = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

          const existing = conversations[cid];
          if (!existing) return prev;
          if (String((existing as any).scenarioId ?? "") !== sid) return prev;

          delete conversations[cid];

          for (const [mid, m] of Object.entries(messages)) {
            if (String((m as any).scenarioId ?? "") !== sid) continue;
            if (String((m as any).conversationId ?? "") !== cid) continue;
            delete messages[mid];
          }

          return { ...(prev as any), conversations, messages };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- reposts
      getRepostEventForProfile: (profileId: string, postId: string) => {
        if (!db) return null;
        const id = `${String(profileId)}|${String(postId)}`;
        return (db as any).reposts?.[id] ?? null;
      },

      isPostRepostedByProfileId: (profileId: string, postId: string) => {
        if (!db) return false;
        const id = `${String(profileId)}|${String(postId)}`;
        return !!(db as any).reposts?.[id];
      },

      isPostRepostedBySelectedProfile: (scenarioId: string, postId: string) => {
        if (!db) return false;
        const sel = (db as any).selectedProfileByScenario?.[String(scenarioId)];
        if (!sel) return false;
        const id = `${String(sel)}|${String(postId)}`;
        return !!(db as any).reposts?.[id];
      },

      toggleRepost: async (scenarioId: string, postId: string) => {
        const sid = String(scenarioId);
        const pid = String(postId);

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          // backend mode: require selected profile
          const selRaw = (db as any)?.selectedProfileByScenario?.[sid];
          const reposterId = selRaw == null ? "" : String(selRaw);
          if (!reposterId) return;

          const key = `${reposterId}|${pid}`;
          const already = Boolean((db as any)?.reposts?.[key]);

          const res = await apiFetch({
            path: `/reposts/posts/${encodeURIComponent(pid)}`,
            token,
            init: {
              method: already ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scenarioId: sid, profileId: reposterId }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Repost failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          const reposted = Boolean((res.json as any)?.reposted);
          const repost = (res.json as any)?.repost;
          const post = (res.json as any)?.post;
          const now = new Date().toISOString();

          const nextDb = await updateDb((prev) => {
            const reposts = { ...((prev as any).reposts ?? {}) } as any;
            const posts = { ...(prev as any).posts } as any;

            if (reposted) {
              reposts[key] = {
                id: String(repost?.id ?? key),
                scenarioId: sid,
                profileId: reposterId,
                postId: pid,
                createdAt: repost?.createdAt
                  ? new Date(repost.createdAt).toISOString()
                  : now,
              } as any;
            } else {
              delete reposts[key];
            }

            if (post && typeof post === "object") {
              const existing = posts[pid] ?? {};
              posts[pid] = {
                ...existing,
                ...post,
                id: String(post?.id ?? pid),
                scenarioId: String(post?.scenarioId ?? post?.scenario_id ?? sid),
                authorProfileId: String(post?.authorProfileId ?? post?.author_profile_id ?? existing?.authorProfileId ?? ""),
                text: String(post?.text ?? existing?.text ?? ""),
                imageUrls: Array.isArray(post?.imageUrls ?? post?.image_urls)
                  ? (post?.imageUrls ?? post?.image_urls).map(String)
                  : (existing?.imageUrls ?? []),
                replyCount: Number(post?.replyCount ?? post?.reply_count ?? existing?.replyCount ?? 0),
                repostCount: Number(post?.repostCount ?? post?.repost_count ?? existing?.repostCount ?? 0),
                likeCount: Number(post?.likeCount ?? post?.like_count ?? existing?.likeCount ?? 0),
                parentPostId: post?.parentPostId ?? post?.parent_post_id ?? existing?.parentPostId,
                quotedPostId: post?.quotedPostId ?? post?.quoted_post_id ?? existing?.quotedPostId,
                insertedAt: post?.insertedAt
                  ? new Date(post.insertedAt).toISOString()
                  : post?.inserted_at
                    ? new Date(post.inserted_at).toISOString()
                    : (existing?.insertedAt ?? now),
                createdAt: post?.createdAt
                  ? new Date(post.createdAt).toISOString()
                  : post?.created_at
                    ? new Date(post.created_at).toISOString()
                    : (existing?.createdAt ?? now),
                updatedAt: post?.updatedAt
                  ? new Date(post.updatedAt).toISOString()
                  : post?.updated_at
                    ? new Date(post.updated_at).toISOString()
                    : now,
                postType: post?.postType ?? post?.post_type ?? existing?.postType,
                meta: post?.meta ?? existing?.meta,
                isPinned: post?.isPinned ?? post?.is_pinned ?? existing?.isPinned,
                pinOrder: post?.pinOrder ?? post?.pin_order ?? existing?.pinOrder,
              } as any;
            }

            return { ...prev, reposts, posts };
          });

          setState({ isReady: true, db: nextDb as any });
          return;
        }

        const next = await updateDb((prev) => {
          const selectedProfileId = (prev as any).selectedProfileByScenario?.[sid];
          if (!selectedProfileId) return prev;

          const reposterId = String(selectedProfileId);
          const post = prev.posts[pid];
          if (!post) return prev;

          const key = `${reposterId}|${pid}`;
          const reposts = { ...((prev as any).reposts ?? {}) };

          const already = !!reposts?.[key];
          const now = new Date().toISOString();

          if (already) {
            delete reposts[key];
          } else {
            reposts[key] = {
              id: key,
              scenarioId: sid,
              profileId: reposterId,
              postId: pid,
              createdAt: now,
            } as Repost;
          }

          return {
            ...prev,
            reposts,
            posts: {
              ...prev.posts,
              [pid]: {
                ...post,
                repostCount: Math.max(0, ((post as any).repostCount ?? 0) + (already ? -1 : 1)),
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: next as any });
      },

      // --- pins (campaign)
      listPinnedPostsForScenario: (scenarioId: string) => {
        if (!db) return [];
        const sid = String(scenarioId);

        const pinnedIds = getPinnedIdsFromScenario(db, sid);
        const out: Post[] = [];

        for (const id of pinnedIds) {
          const p = db.posts?.[String(id)];
          if (!p) continue;
          if (String((p as any).scenarioId) !== sid) continue;
          if ((p as any).parentPostId) continue;
          out.push(p);
        }

        return out;
      },

      togglePinPost: async (scenarioId: string, postId: string, nextPinned: boolean) => {
        const sid = String(scenarioId ?? "").trim();
        const pid = String(postId ?? "").trim();
        if (!sid || !pid) return;

        const nextDb = await updateDb((prev) => {
          const scenario = prev.scenarios?.[sid];
          if (!scenario) return prev;

          const post = prev.posts?.[pid];
          if (!post) return prev;

          // only pin root posts in this scenario
          if ((post as any).parentPostId) return prev;
          if (String((post as any).scenarioId) !== sid) return prev;

          const now = new Date().toISOString();

          const prevSettings = (((scenario as any).settings ?? {}) as Record<string, any>);
          const prevPinned = Array.isArray(prevSettings.pinnedPostIds)
            ? prevSettings.pinnedPostIds.map(String).filter(Boolean)
            : [];

          let pinnedIds = [...prevPinned];
          const already = pinnedIds.includes(pid);

          if (nextPinned) {
            if (!already) {
              // append so “first pinned is #1”
              pinnedIds.push(pid);
            }
          } else {
            if (already) pinnedIds = pinnedIds.filter((x) => x !== pid);
          }

          pinnedIds = uniq(pinnedIds);

          const nextSettings = { ...prevSettings, pinnedPostIds: pinnedIds };

          const posts = { ...prev.posts };

          // update pinned posts’ pinOrder (1-based)
          pinnedIds.forEach((id, idx) => {
            const p = posts[id];
            if (!p) return;
            if (String((p as any).scenarioId) !== sid) return;
            posts[id] = {
              ...p,
              isPinned: true,
              pinOrder: idx + 1,
              updatedAt: now,
            } as any;
          });

          // clear pin flags for posts in this scenario not pinned anymore
          const pinnedSet = new Set(pinnedIds);
          for (const p of Object.values(posts)) {
            if (String((p as any).scenarioId) !== sid) continue;
            const id = String((p as any).id);
            if (!pinnedSet.has(id) && (((p as any).isPinned) || (p as any).pinOrder != null)) {
              posts[id] = {
                ...p,
                isPinned: false,
                pinOrder: undefined,
                updatedAt: now,
              } as any;
            }
          }

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...scenario,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
            posts,
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      reorderPinnedPostsForScenario: async (scenarioId: string, orderedPostIds: string[]) => {
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return;

        const ids = (orderedPostIds ?? []).map(String).filter(Boolean);

        const nextDb = await updateDb((prev) => {
          const scenario = prev.scenarios?.[sid];
          if (!scenario) return prev;

          const now = new Date().toISOString();

          // validate + keep only existing root posts in this scenario
          const clean: string[] = [];
          const seen = new Set<string>();

          for (const id of ids) {
            if (seen.has(id)) continue;
            const p = prev.posts?.[id];
            if (!p) continue;
            if (String((p as any).scenarioId) !== sid) continue;
            if ((p as any).parentPostId) continue;
            clean.push(id);
            seen.add(id);
          }

          const prevSettings = (((scenario as any).settings ?? {}) as Record<string, any>);
          const nextSettings = { ...prevSettings, pinnedPostIds: clean };

          const posts = { ...prev.posts };

          // apply pinOrder (1-based)
          clean.forEach((id, idx) => {
            const p = posts[id];
            if (!p) return;
            posts[id] = {
              ...p,
              isPinned: true,
              pinOrder: idx + 1,
              updatedAt: now,
            } as any;
          });

          // clear pin flags for posts in scenario not in clean
          const pinnedSet = new Set(clean);
          for (const p of Object.values(posts)) {
            if (String((p as any).scenarioId) !== sid) continue;
            const id = String((p as any).id);
            if (!pinnedSet.has(id) && (((p as any).isPinned) || (p as any).pinOrder != null)) {
              posts[id] = { ...p, isPinned: false, pinOrder: undefined, updatedAt: now } as any;
            }
          }

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...scenario,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
            posts,
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      // --- scenarios
      getScenarioById: (id) => (db ? db.scenarios[String(id)] ?? null : null),
      listScenarios: () => (db ? Object.values(db.scenarios) : []),

      upsertScenario: async (s) => {
        const upsertScenarioLocal = async (localScenario: Scenario) => {
          const id = String((localScenario as any).id);
          const now = new Date().toISOString();

          const next = await updateDb((prev) => {
            const existing = prev.scenarios[id];

            // --- GLOBAL TAG REGISTRY ---
            const prevTags = ((prev as any).tags ?? {}) as Record<string, GlobalTag>;
            const nextTags: Record<string, GlobalTag> = { ...prevTags };

            const scenarioTags: ScenarioTag[] = [];

            for (const raw of (localScenario as any).tags ?? []) {
              const key = String((raw as any).key ?? (raw as any).id ?? "").toLowerCase();
              if (!key) continue;

              let tag = nextTags[key];

              if (!tag) {
                const built = buildGlobalTagFromKey(key);
                if (!built) continue;

                nextTags[key] = built;
                tag = built;
              }

              scenarioTags.push({
                id: `t_${tag.key}`,
                key: tag.key,
                name: tag.name,
                color: tag.color,
              } as any);
            }

            return {
              ...prev,
              tags: nextTags,
              scenarios: {
                ...prev.scenarios,
                [id]: {
                  ...(existing ?? {}),
                  ...localScenario,
                  id,
                  tags: scenarioTags,
                  createdAt: (existing as any)?.createdAt ?? (localScenario as any).createdAt ?? now,
                  updatedAt: now,
                } as any,
              },
            };
          });

          setState({ isReady: true, db: next as any });
        };

        const normalizeScenarioFromServer = (raw: any, fallback?: any): Scenario => {
          const now = new Date().toISOString();

          const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
          const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];

          const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
          const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

          const scenario: Scenario = {
            ...(fallback ?? {}),
            id: String(raw?.id ?? (fallback as any)?.id ?? "").trim(),
            name: String(raw?.name ?? (fallback as any)?.name ?? ""),
            cover: String(raw?.cover ?? raw?.cover_url ?? (fallback as any)?.cover ?? ""),
            inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? (fallback as any)?.inviteCode ?? ""),
            ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? (fallback as any)?.ownerUserId ?? ""),
            description: raw?.description != null ? String(raw.description) : (fallback as any)?.description,
            mode:
              raw?.mode === "campaign" || raw?.mode === "story"
                ? raw.mode
                : (fallback as any)?.mode === "campaign"
                  ? "campaign"
                  : "story",
            playerIds: playerIds.length ? playerIds : ((fallback as any)?.playerIds ?? []),
            tags: Array.isArray(raw?.tags) ? raw.tags : ((fallback as any)?.tags ?? []),
            gmUserIds: gmUserIds ?? (fallback as any)?.gmUserIds,
            settings: raw?.settings != null ? raw.settings : (fallback as any)?.settings,
            createdAt: raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : (fallback as any)?.createdAt ?? now,
            updatedAt: raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : now,
          } as any;

          return scenario;
        };

        // Backend mode: create/update on server, then merge response into local DB.
        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const sid = String((s as any)?.id ?? "").trim();
          const isEdit = Boolean(sid && (db as any)?.scenarios?.[sid]);

          const payload = {
            name: String((s as any)?.name ?? "").trim(),
            cover: String((s as any)?.cover ?? "").trim(),
            inviteCode: String((s as any)?.inviteCode ?? "").trim(),
            description: (s as any)?.description ?? null,
            mode: (s as any)?.mode === "campaign" ? "campaign" : "story",
            settings: (s as any)?.settings ?? {},
            gmUserIds: Array.isArray((s as any)?.gmUserIds) ? (s as any)?.gmUserIds : undefined,
            tags: Array.isArray((s as any)?.tags) ? (s as any)?.tags : undefined,
          };

          const res = await apiFetch({
            path: isEdit ? `/scenarios/${encodeURIComponent(sid)}` : "/scenarios",
            token,
            init: {
              method: isEdit ? "PATCH" : "POST",
              body: JSON.stringify(payload),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Save failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          const raw = (res.json as any)?.scenario;
          if (!raw) throw new Error("Invalid server response");

          const normalized = normalizeScenarioFromServer(raw, isEdit ? (db as any)?.scenarios?.[sid] : undefined);
          if (!String((normalized as any)?.id ?? "").trim()) throw new Error("Invalid server response");

          await upsertScenarioLocal(normalized);
          return;
        }

        await upsertScenarioLocal(s);
      },

      joinScenarioByInviteCode: async (inviteCode, userId) => {
                // After joining, clear selected profile if it is no longer owned by the user or is still public (adopted by someone else)
        await updateDb((prev: any) => {
          const sid = String(foundScenarioId || "");
          if (!sid) return prev;
          const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
          const selectedProfileId = selectedProfileByScenario[sid];
          if (selectedProfileId) {
            const profile = (prev as any).profiles?.[selectedProfileId];
            // If the profile is gone, or is now owned by someone else, or is still public (not reclaimed), clear selection
            if (!profile || String(profile.ownerUserId) !== String(userId) || !!profile.isPublic) {
              delete selectedProfileByScenario[sid];
            }
          }
          return { ...prev, selectedProfileByScenario };
        });
        const code = String(inviteCode ?? "").trim().toUpperCase();
        const uid = String(userId ?? "").trim();
        if (!code || !uid) return null;

        // Backend mode: ask server to join by invite code, then merge returned scenario into local DB.
        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: "/scenarios/join",
            token,
            init: {
              method: "POST",
              body: JSON.stringify({ inviteCode: code }),
            },
          });

          if (res.status === 404) return null;
          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Join failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          const payload = res.json as any;
          const raw = payload?.scenario;
          const alreadyIn = Boolean(payload?.alreadyIn);
          const sid = String(raw?.id ?? "").trim();
          if (!raw || !sid) throw new Error("Invalid server response");

          const now = new Date().toISOString();

          const nextDb = await updateDb((prev) => {
            const existing = (prev.scenarios as any)?.[sid];

            const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
            const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String) : [];

            const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
            const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

            const settings = raw?.settings != null ? raw.settings : undefined;

            const nextScenario: Scenario = {
              ...(existing ?? {}),
              id: sid,
              name: String(raw?.name ?? existing?.name ?? ""),
              cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
              inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
              ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
              description: raw?.description != null ? String(raw.description) : existing?.description,
              mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : (existing?.mode ?? "story"),
              playerIds:
                playerIds.length > 0
                  ? Array.from(new Set([...playerIds, uid]))
                  : Array.from(new Set([...(existing?.playerIds ?? []).map(String), uid])),
              tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
              gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
              settings: settings ?? (existing as any)?.settings,
              createdAt: raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : raw?.createdAt
                  ? new Date(raw.createdAt).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updated_at
                ? new Date(raw.updated_at).toISOString()
                : raw?.updatedAt
                  ? new Date(raw.updatedAt).toISOString()
                  : now,
            } as any;

            // If we were previously "out" locally (profiles were made public), re-joining should reclaim them.
            const profiles = { ...prev.profiles };
            if (!alreadyIn) {
              for (const k of Object.keys(profiles)) {
                const p = (profiles as any)[k];
                if (!p) continue;
                if (String(p.scenarioId) !== sid) continue;
                if (String(p.ownerUserId) !== uid) continue;
                if (!p.isPublic) continue;
                profiles[k] = { ...p, isPublic: false, updatedAt: now };
              }
            }

            return {
              ...prev,
              scenarios: {
                ...(prev.scenarios ?? {}),
                [sid]: nextScenario as any,
              },
              profiles,
            };
          });

          setState({ isReady: true, db: nextDb as any });
          const scenario = (nextDb as any)?.scenarios?.[sid] as Scenario | undefined;
          if (!scenario) return null;
          return { scenario, alreadyIn };
        }

        let alreadyIn = false;
        let foundScenarioId: string | null = null;

        const nextDb = await updateDb((prev) => {
          const scenarios = Object.values(prev.scenarios ?? {});
          const found = scenarios.find((s) => String((s as any).inviteCode ?? "").toUpperCase() === code);
          if (!found) return prev;

          const sid = String((found as any).id);
          foundScenarioId = sid;

          const current = prev.scenarios[sid];
          if (!current) return prev;

          const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
          alreadyIn = players.includes(uid);

          if (alreadyIn) return prev;

          const now = new Date().toISOString();

          // also reclaim any of your still-owned shared profiles in this scenario
          // (i.e. profiles that were made public when you left, and were not adopted by someone else)
          const profiles = { ...prev.profiles };
          for (const k of Object.keys(profiles)) {
            const p = (profiles as any)[k];
            if (!p) continue;
            if (String(p.scenarioId) !== sid) continue;
            if (String(p.ownerUserId) !== uid) continue;
            if (!p.isPublic) continue;
            profiles[k] = { ...p, isPublic: false, updatedAt: now };
          }

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                playerIds: Array.from(new Set([...players, uid])),
                updatedAt: now,
              } as any,
            },
            profiles,
          };
        });

        setState({ isReady: true, db: nextDb as any });

        if (!foundScenarioId) return null;

        const scenario = (nextDb as any)?.scenarios?.[foundScenarioId] as Scenario | undefined;
        if (!scenario) return null;

        return { scenario, alreadyIn };
      },

      adoptPublicProfile: async ({ scenarioId, profileId, userId }) => {
        const sid = String(scenarioId ?? "").trim();
        const pid = String(profileId ?? "").trim();
        const uid = String(userId ?? "").trim();

        if (!sid) return { ok: false, error: "scenarioId is required" };
        if (!pid) return { ok: false, error: "profileId is required" };
        if (!uid) return { ok: false, error: "userId is required" };
        if (!db) return { ok: false, error: "DB not ready" };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/profiles/${encodeURIComponent(pid)}/adopt`,
            token,
            init: { method: "POST" },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Adoption failed (HTTP ${res.status})`;
            return { ok: false, error: msg };
          }

          const raw = (res.json as any)?.profile;
          if (!raw) return { ok: false, error: "Invalid server response" };

          const now = new Date().toISOString();
          const nextDb = await updateDb((prev) => {
            const profiles = { ...(prev as any).profiles } as any;
            const id = String(raw?.id ?? pid);
            const existing = profiles[id] ?? (prev as any).profiles?.[id] ?? {};

            profiles[id] = {
              ...existing,
              id,
              scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
              ownerUserId: String(raw?.ownerUserId ?? raw?.owner_user_id ?? uid),
              displayName: String(raw?.displayName ?? raw?.display_name ?? existing?.displayName ?? ""),
              handle: String(raw?.handle ?? existing?.handle ?? ""),
              avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? existing?.avatarUrl ?? ""),
              headerUrl: raw?.headerUrl ?? raw?.header_url ?? existing?.headerUrl,
              bio: raw?.bio ?? existing?.bio,
              isPublic: raw?.isPublic ?? raw?.is_public ?? false,
              isPrivate: raw?.isPrivate ?? raw?.is_private ?? true,
              joinedDate: raw?.joinedDate ?? raw?.joined_date ?? existing?.joinedDate,
              location: raw?.location ?? existing?.location,
              link: raw?.link ?? existing?.link,
              followerCount: raw?.followerCount ?? raw?.follower_count ?? existing?.followerCount,
              followingCount: raw?.followingCount ?? raw?.following_count ?? existing?.followingCount,
              createdAt: raw?.createdAt
                ? new Date(raw.createdAt).toISOString()
                : raw?.created_at
                  ? new Date(raw.created_at).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updatedAt
                ? new Date(raw.updatedAt).toISOString()
                : raw?.updated_at
                  ? new Date(raw.updated_at).toISOString()
                  : now,
            } as any;

            return { ...prev, profiles };
          });

          setState({ isReady: true, db: nextDb as any });
          return { ok: true };
        }

        const scenario = (db as any).scenarios?.[sid];
        if (!scenario) return { ok: false, error: "Scenario not found" };

        const players: string[] = Array.isArray((scenario as any).playerIds)
          ? (scenario as any).playerIds.map(String)
          : [];
        if (!players.includes(uid)) return { ok: false, error: "User not in scenario" };

        const existing = (db as any).profiles?.[pid] as Profile | undefined;
        if (!existing) return { ok: false, error: "Profile not found" };
        if (String((existing as any).scenarioId) !== sid) return { ok: false, error: "Profile not in scenario" };

        const ownerId = String((existing as any).ownerUserId ?? "");
        if (ownerId === uid) return { ok: false, error: "You already own this profile" };
        if (!existing.isPublic) return { ok: false, error: "Profile not shared" };

        const now = new Date().toISOString();

        const nextDb = await updateDb((prev) => {
          const current = (prev as any).profiles?.[pid];
          if (!current) return prev;
          if (String((current as any).scenarioId) !== sid) return prev;
          if (!(current as any).isPublic) return prev;

          return {
            ...prev,
            profiles: {
              ...(prev as any).profiles,
              [pid]: {
                ...current,
                ownerUserId: uid,
                isPublic: false,
                updatedAt: now,
              },
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });

        const after = (nextDb as any)?.profiles?.[pid];
        if (!after) return { ok: false, error: "Adoption failed" };
        if (String((after as any).ownerUserId ?? "") !== uid) return { ok: false, error: "Adoption failed" };

        return { ok: true };
      },

      transferScenarioOwnership: async (scenarioId: string, fromUserId: string, toUserId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const from = String(fromUserId ?? "").trim();
        const to = String(toUserId ?? "").trim();

        if (!sid || !from || !to) return null;
        if (from === to) return null;

        const transferOwnershipLocal = async () => {
          const nextDb = await updateDb((prev) => {
            const current = prev.scenarios?.[sid];
            if (!current) return prev;

            const owner = String((current as any).ownerUserId ?? "");
            if (owner !== from) return prev;

            const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
            if (!players.includes(to)) return prev;

            const now = new Date().toISOString();

            return {
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [sid]: {
                  ...current,
                  ownerUserId: to,
                  updatedAt: now,
                } as any,
              },
            };
          });

          setState({ isReady: true, db: nextDb as any });

          const updated = (nextDb as any)?.scenarios?.[sid] as Scenario | undefined;
          return updated ?? null;
        };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/transfer-ownership`,
            token,
            init: {
              method: "POST",
              body: JSON.stringify({ toUserId: to }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Transfer failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          const raw = (res.json as any)?.scenario;
          if (!raw) throw new Error("Invalid server response");

          // merge server scenario via upsertScenario (will go local because token/baseUrl present -> would recurse)
          // so do a direct local merge here.
          const now = new Date().toISOString();
          const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
          const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];
          const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
          const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

          const nextDb = await updateDb((prev) => {
            const existing = (prev.scenarios as any)?.[sid];
            const merged: Scenario = {
              ...(existing ?? {}),
              id: String(raw?.id ?? sid),
              name: String(raw?.name ?? existing?.name ?? ""),
              cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
              inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
              ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
              description: raw?.description != null ? String(raw.description) : existing?.description,
              mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : (existing?.mode ?? "story"),
              playerIds: playerIds.length ? playerIds : (existing?.playerIds ?? []),
              tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
              gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
              settings: raw?.settings != null ? raw.settings : (existing as any)?.settings,
              createdAt: raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : raw?.createdAt
                  ? new Date(raw.createdAt).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updated_at
                ? new Date(raw.updated_at).toISOString()
                : raw?.updatedAt
                  ? new Date(raw.updatedAt).toISOString()
                  : now,
            } as any;

            return {
              ...prev,
              scenarios: {
                ...(prev.scenarios ?? {}),
                [sid]: merged as any,
              },
            };
          });

          setState({ isReady: true, db: nextDb as any });
          return ((nextDb as any)?.scenarios?.[sid] as Scenario | undefined) ?? null;
        }

        return await transferOwnershipLocal();
      },

      transferProfilesToUser: async ({ scenarioId, profileIds, toUserId }) => {
        const sid = String(scenarioId ?? "").trim();
        const to = String(toUserId ?? "").trim();
        const ids = (profileIds ?? []).map(String).filter(Boolean);

        if (!sid) return { ok: false, error: "scenarioId is required" };
        if (!to) return { ok: false, error: "toUserId is required" };
        if (ids.length === 0) return { ok: false, error: "profileIds is required" };
        if (!db) return { ok: false, error: "DB not ready" };
        if (!auth.isReady) return { ok: false, error: "Auth not ready" };
        if (!currentUserId) return { ok: false, error: "Not signed in" };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/transfer-profiles`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toUserId: to, profileIds: ids }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Transfer failed (HTTP ${res.status})`;
            return { ok: false, error: msg };
          }

          const transferred = Number((res.json as any)?.transferred ?? 0);
          const skipped = Array.isArray((res.json as any)?.skipped) ? (res.json as any).skipped.map(String) : [];

          // Refresh profiles from server after transfer.
          profilesSyncRef.current.lastSyncAtByScenario[sid] = 0;
          return { ok: true, transferred, skipped };
        }

        const scenario = (db as any).scenarios?.[sid];
        if (!scenario) return { ok: false, error: "Scenario not found" };

        const players: string[] = Array.isArray((scenario as any).playerIds)
          ? (scenario as any).playerIds.map(String)
          : [];

        if (!players.includes(to)) return { ok: false, error: "Target user not in scenario" };

        const scenarioOwnerId = String((scenario as any).ownerUserId ?? "");
        const isScenarioOwner = scenarioOwnerId && scenarioOwnerId === currentUserId;

        const attemptedUnique = Array.from(new Set(ids));
        const now = new Date().toISOString();
        const skipped: string[] = [];

        const nextDb = await updateDb((prev) => {
          const profiles = { ...prev.profiles };

          for (const pid of attemptedUnique) {
            const existing = profiles[pid];
            if (!existing) {
              skipped.push(pid);
              continue;
            }

            if (String((existing as any).scenarioId) !== sid) {
              skipped.push(pid);
              continue;
            }

            const ownerId = String((existing as any).ownerUserId ?? "");
            const canTransfer = ownerId === currentUserId || isScenarioOwner;
            if (!canTransfer) {
              skipped.push(pid);
              continue;
            }

            if (ownerId === to) continue; // already owned by target

            profiles[pid] = {
              ...existing,
              ownerUserId: to,
              updatedAt: now,
            } as any;
          }

          return { ...prev, profiles };
        });

        setState({ isReady: true, db: nextDb as any });

        // transferred = profiles that ended up owned by `to` and not skipped
        const skippedSet = new Set(skipped.map(String));
        let transferred = 0;
        for (const pid of attemptedUnique) {
          if (skippedSet.has(pid)) continue;
          const p = (nextDb as any).profiles?.[pid];
          if (!p) continue;
          if (String((p as any).scenarioId) !== sid) continue;
          if (String((p as any).ownerUserId) === to) transferred += 1;
        }

        return { ok: true, transferred, skipped };
      },

      leaveScenario: async (scenarioId: string, userId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const uid = String(userId ?? "").trim();
        if (!sid || !uid) return null;

        let deleted = false;

        const deleteScenarioCascadeLocal = async () => {
          const nextDb = await updateDb((prev) => {
            const scenarios = { ...prev.scenarios };
            delete scenarios[sid];

            const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
            delete selectedProfileByScenario[sid];

            const profiles = { ...prev.profiles };
            for (const k of Object.keys(profiles)) {
              if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
            }

            const posts = { ...prev.posts };
            for (const k of Object.keys(posts)) {
              if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
            }

            const reposts = { ...((prev as any).reposts ?? {}) };
            for (const k of Object.keys(reposts ?? {})) {
              if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
            }

            const sheets = { ...((prev as any).sheets ?? {}) };
            for (const k of Object.keys(sheets)) {
              const sheet = (sheets as any)[k];
              if (String(sheet?.scenarioId ?? "") === sid) delete sheets[k];
            }

            const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
            for (const k of Object.keys(conversations)) {
              if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
            }

            const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
            for (const k of Object.keys(messages)) {
              if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
            }

            return {
              ...prev,
              scenarios,
              profiles,
              posts,
              reposts,
              sheets,
              conversations,
              messages,
              selectedProfileByScenario,
            };
          });

          setState({ isReady: true, db: nextDb as any });
        };

        const leaveScenarioLocal = async () => {
          const nextDb = await updateDb((prev) => {
            const current = prev.scenarios?.[sid];
            if (!current) return prev;

            const ownerId = String((current as any).ownerUserId ?? "");
            const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
            if (!players.includes(uid)) return prev;

            const remaining: string[] = players.filter((p: string) => p !== uid);
            const now = new Date().toISOString();

            // owner leaving (allowed only if alone)
            if (uid === ownerId) {
              if (remaining.length > 0) return prev;

              deleted = true;

              const scenarios = { ...prev.scenarios };
              delete scenarios[sid];

              const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
              delete selectedProfileByScenario[sid];

              const profiles = { ...prev.profiles };
              for (const k of Object.keys(profiles)) {
                if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
              }

              const posts = { ...prev.posts };
              for (const k of Object.keys(posts)) {
                if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
              }

              const reposts = { ...((prev as any).reposts ?? {}) };
              for (const k of Object.keys(reposts ?? {})) {
                if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
              }

              const sheets = { ...((prev as any).sheets ?? {}) };
              for (const k of Object.keys(sheets)) {
                const sheet = (sheets as any)[k];
                if (String(sheet?.scenarioId ?? "") === sid) delete sheets[k];
              }

              const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
              for (const k of Object.keys(conversations)) {
                if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
              }

              const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
              for (const k of Object.keys(messages)) {
                if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
              }

              return {
                ...prev,
                scenarios,
                profiles,
                posts,
                reposts,
                sheets,
                conversations,
                messages,
                selectedProfileByScenario,
              };
            }

            // normal user leaving
            // - remove from scenario playerIds
            // - mark all profiles you own in this scenario as shared/public
            //   (ownerUserId remains, so if you re-join and nobody adopted them, you can reclaim them)
            const profiles = { ...prev.profiles };
            for (const k of Object.keys(profiles)) {
              const p = (profiles as any)[k];
              if (!p) continue;
              if (String(p.scenarioId) !== sid) continue;
              if (String(p.ownerUserId) !== uid) continue;
              profiles[k] = { ...p, isPublic: true, updatedAt: now };
            }

            return {
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [sid]: {
                  ...current,
                  playerIds: remaining,
                  updatedAt: now,
                } as any,
              },
              profiles,
            };
          });

          setState({ isReady: true, db: nextDb as any });
        };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/leave`,
            token,
            init: {
              method: "POST",
              body: JSON.stringify({}),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Leave failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          deleted = Boolean((res.json as any)?.deleted);

          if (deleted) {
            await deleteScenarioCascadeLocal();
          } else {
            // Mirror local behavior so the scenario immediately disappears from the list.
            const nextDb = await updateDb((prev) => {
              const current = prev.scenarios?.[sid];
              if (!current) return prev;

              const players = Array.isArray((current as any).playerIds) ? (current as any).playerIds.map(String) : [];
              const remaining: string[] = players.filter((p: string) => p !== uid);
              const now = new Date().toISOString();

              const profiles = { ...prev.profiles };
              for (const k of Object.keys(profiles)) {
                const p = (profiles as any)[k];
                if (!p) continue;
                if (String(p.scenarioId) !== sid) continue;
                if (String(p.ownerUserId) !== uid) continue;
                profiles[k] = { ...p, isPublic: true, updatedAt: now };
              }

              return {
                ...prev,
                scenarios: {
                  ...prev.scenarios,
                  [sid]: {
                    ...current,
                    playerIds: remaining,
                    updatedAt: now,
                  } as any,
                },
                profiles,
              };
            });

            setState({ isReady: true, db: nextDb as any });
          }

          return { deleted };
        }

        await leaveScenarioLocal();
        return { deleted };
      },

      deleteScenario: async (scenarioId: string, ownerUserId: string) => {
        const sid = String(scenarioId ?? "").trim();
        const uid = String(ownerUserId ?? "").trim();
        if (!sid || !uid) return false;

        const deleteScenarioLocal = async () => {
          const nextDb = await updateDb((prev) => {
            const current = prev.scenarios?.[sid];
            if (!current) return prev;

            const ownerId = String((current as any).ownerUserId ?? "");
            if (ownerId !== uid) return prev;

            const scenarios = { ...prev.scenarios };
            delete scenarios[sid];

            const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
            delete selectedProfileByScenario[sid];

            const profiles = { ...prev.profiles };
            for (const k of Object.keys(profiles)) {
              if (String((profiles as any)[k]?.scenarioId) === sid) delete profiles[k];
            }

            const posts = { ...prev.posts };
            for (const k of Object.keys(posts)) {
              if (String((posts as any)[k]?.scenarioId) === sid) delete posts[k];
            }

            const reposts = { ...((prev as any).reposts ?? {}) };
            for (const k of Object.keys(reposts ?? {})) {
              if (String((reposts as any)[k]?.scenarioId) === sid) delete reposts[k];
            }

            const sheets = { ...((prev as any).sheets ?? {}) };
            for (const k of Object.keys(sheets)) {
              const sheet = (sheets as any)[k];
              if (String(sheet?.scenarioId ?? "") === sid) delete sheets[k];
            }

            const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
            for (const k of Object.keys(conversations)) {
              if (String((conversations as any)[k]?.scenarioId ?? "") === sid) delete conversations[k];
            }

            const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
            for (const k of Object.keys(messages)) {
              if (String((messages as any)[k]?.scenarioId ?? "") === sid) delete messages[k];
            }

            return {
              ...prev,
              scenarios,
              profiles,
              posts,
              reposts,
              sheets,
              conversations,
              messages,
              selectedProfileByScenario,
            };
          });

          setState({ isReady: true, db: nextDb as any });
          return !(nextDb as any)?.scenarios?.[sid];
        };

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}`,
            token,
            init: { method: "DELETE" },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Delete failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          // Server deleted; now cascade locally.
          return await deleteScenarioLocal();
        }

        return await deleteScenarioLocal();
      },

      setScenarioMode: async (scenarioId, mode) => {
        const sid = String(scenarioId ?? "").trim();
        const nextMode: "story" | "campaign" = mode === "campaign" ? "campaign" : "story";
        if (!sid) return null;

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}`,
            token,
            init: {
              method: "PATCH",
              body: JSON.stringify({ mode: nextMode }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Update failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          const raw = (res.json as any)?.scenario;
          if (!raw) throw new Error("Invalid server response");

          const now = new Date().toISOString();
          const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
          const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];
          const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
          const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

          const nextDb = await updateDb((prev) => {
            const existing = (prev.scenarios as any)?.[sid];

            const merged: Scenario = {
              ...(existing ?? {}),
              id: String(raw?.id ?? sid),
              name: String(raw?.name ?? existing?.name ?? ""),
              cover: String(raw?.cover ?? raw?.cover_url ?? existing?.cover ?? ""),
              inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? existing?.inviteCode ?? ""),
              ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? existing?.ownerUserId ?? ""),
              description: raw?.description != null ? String(raw.description) : existing?.description,
              mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : nextMode,
              playerIds: playerIds.length ? playerIds : (existing?.playerIds ?? []),
              tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
              gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
              settings: raw?.settings != null ? raw.settings : (existing as any)?.settings,
              createdAt: raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : raw?.createdAt
                  ? new Date(raw.createdAt).toISOString()
                  : (existing?.createdAt ?? now),
              updatedAt: raw?.updated_at
                ? new Date(raw.updated_at).toISOString()
                : raw?.updatedAt
                  ? new Date(raw.updatedAt).toISOString()
                  : now,
            } as any;

            return {
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [sid]: merged as any,
              },
            };
          });

          setState({ isReady: true, db: nextDb as any });
          return (nextDb as any)?.scenarios?.[sid] ?? null;
        }

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                mode: nextMode,
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return (nextDb as any)?.scenarios?.[sid] ?? null;
      },

      // --- character sheets
      getCharacterSheetByProfileId: (profileId: string) => (db ? (db as any).sheets?.[String(profileId)] ?? null : null),

      upsertCharacterSheet: async (sheet: CharacterSheet) => {
        const key = String((sheet as any).profileId ?? (sheet as any).ownerProfileId ?? "");
        if (!key) throw new Error("CharacterSheet.profileId is required");

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();

        let serverSheet: any = null;
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/profiles/${encodeURIComponent(key)}/character-sheet`,
            token,
            init: {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sheet ?? {}),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Save failed (HTTP ${res.status})`;
            throw new Error(msg);
          }

          serverSheet = (res.json as any)?.sheet ?? null;
        }

        const now = new Date().toISOString();
        const raw = serverSheet ?? sheet;

        const nextDb = await updateDb((prev) => {
          const prevSheets = ((prev as any).sheets ?? {}) as Record<string, CharacterSheet>;
          const existing = prevSheets[key];
          const createdAt = (existing as any)?.createdAt ?? (raw as any)?.createdAt ?? now;

          return {
            ...prev,
            sheets: {
              ...prevSheets,
              [key]: {
                ...(existing ?? {}),
                ...raw,
                profileId: key,
                createdAt,
                updatedAt: (raw as any)?.updatedAt
                  ? new Date((raw as any).updatedAt).toISOString()
                  : (raw as any)?.updated_at
                    ? new Date((raw as any).updated_at).toISOString()
                    : now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      // GM: apply patch to 1+ sheets, then create a GM post that logs the diff
      gmApplySheetUpdate: async ({ scenarioId, gmProfileId, targetProfileIds, patch, label }) => {
        const sid = String(scenarioId ?? "").trim();
        const gmId = String(gmProfileId ?? "").trim();
        const targets = (targetProfileIds ?? []).map(String).filter(Boolean);

        if (!sid) throw new Error("gmApplySheetUpdate: scenarioId is required");
        if (!gmId) throw new Error("gmApplySheetUpdate: gmProfileId is required");
        if (targets.length === 0) throw new Error("gmApplySheetUpdate: targetProfileIds is required");

        const now = new Date().toISOString();
        const postId = `gm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        let summaryText = "";
        let updatedProfileIds: string[] = [];

        const nextDb = await updateDb((prev) => {
          const prevSheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
          const profiles = { ...prev.profiles };

          const perTargetBlocks: string[] = [];

          for (const pid of targets) {
            const profile = profiles[String(pid)];
            if (!profile) continue;

            const existing = (prevSheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);

            const nextSheet = {
              ...(existing ?? {}),
              ...(patch ?? {}),
              profileId: pid,
              scenarioId: sid,
              updatedAt: now,
              createdAt: (existing as any)?.createdAt ?? now,
            } as any;

            // write back
            prevSheets[pid] = nextSheet;
            updatedProfileIds.push(pid);

            // build diff lines
            const lines = diffShallow(existing, nextSheet);
            if (lines.length === 0) {
              perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}: (no changes)`);
            } else {
              perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}\n${lines.join("\n")}`);
            }
          }

          const targetHandles = updatedProfileIds
            .map((pid) => {
              const p = profiles[String(pid)];
              return p ? `@${String((p as any).handle ?? pid)}` : `@${pid}`;
            })
            .join(", ");

          summaryText =
            `⚙️ gm update${label ? ` — ${label}` : ""}\n` +
            `targets: ${targetHandles}\n\n` +
            perTargetBlocks.join("\n\n");

          const newPost: Post = {
            id: postId,
            scenarioId: sid,
            authorProfileId: gmId,
            text: summaryText,
            createdAt: now,
            insertedAt: now,
          } as any;

          return {
            ...prev,
            sheets: prevSheets as any,
            posts: {
              ...prev.posts,
              [postId]: newPost as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });

        // NOTE: summaryText / updatedProfileIds were set inside updateDb closure
        return { postId, updatedProfileIds, summaryText };
      },

      // GM: write an exact sheet + custom post text in a single update
      gmCommitSheetAndPostText: async ({ scenarioId, gmProfileId, targetProfileId, nextSheet, postText }) => {
        const sid = String(scenarioId ?? "").trim();
        const gmId = String(gmProfileId ?? "").trim();
        const pid = String(targetProfileId ?? "").trim();

        if (!sid) throw new Error("gmCommitSheetAndPostText: scenarioId is required");
        if (!gmId) throw new Error("gmCommitSheetAndPostText: gmProfileId is required");
        if (!pid) throw new Error("gmCommitSheetAndPostText: targetProfileId is required");

        const now = new Date().toISOString();
        const postId = `gm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();

        // In backend mode, local-only posts are filtered out of the feed.
        // So we must persist both the sheet + recap post to the API.
        if (token && baseUrl) {
          if (!isUuidLike(sid)) throw new Error("Invalid scenarioId for backend mode");
          if (!isUuidLike(gmId)) throw new Error("Pick a valid GM profile before posting.");

          // 1) Save sheet
          const sheetRes = await apiFetch({
            path: `/profiles/${encodeURIComponent(pid)}/character-sheet`,
            token,
            init: {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...(nextSheet ?? {}), profileId: pid, scenarioId: sid }),
            },
          });

          if (!sheetRes.ok) {
            const msg =
              typeof (sheetRes.json as any)?.error === "string"
                ? String((sheetRes.json as any).error)
                : typeof sheetRes.text === "string" && sheetRes.text.trim().length
                  ? sheetRes.text
                  : `Save failed (HTTP ${sheetRes.status})`;
            throw new Error(msg);
          }

          const rawSheet = (sheetRes.json as any)?.sheet ?? null;

          // 2) Create GM recap post
          const postRes = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/posts`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: postId,
                authorProfileId: gmId,
                text: String(postText ?? ""),
                createdAt: now,
                insertedAt: now,
                postType: "gm",
              }),
            },
          });

          if (!postRes.ok) {
            const msg =
              typeof (postRes.json as any)?.error === "string"
                ? String((postRes.json as any).error)
                : typeof postRes.text === "string" && postRes.text.trim().length
                  ? postRes.text
                  : `Save failed (HTTP ${postRes.status})`;
            throw new Error(msg);
          }

          const rawPost = (postRes.json as any)?.post ?? null;
          const createdAtIso = rawPost?.createdAt
            ? new Date(rawPost.createdAt).toISOString()
            : rawPost?.created_at
              ? new Date(rawPost.created_at).toISOString()
              : now;
          const insertedAtIso = rawPost?.insertedAt
            ? new Date(rawPost.insertedAt).toISOString()
            : rawPost?.inserted_at
              ? new Date(rawPost.inserted_at).toISOString()
              : now;

          // Mark as server-seen so it appears immediately in backend mode.
          const seen = (serverSeenPostsRef.current.byScenario[sid] ??= {});
          seen[String(rawPost?.id ?? postId)] = true;

          const nextDb = await updateDb((prev) => {
            const sheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
            const posts = { ...(prev.posts ?? {}) } as any;

            const existingSheet = (sheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);
            const createdAtLocal = (existingSheet as any)?.createdAt ?? now;

            // Merge in server sheet if present, otherwise fall back to nextSheet.
            const mergedSheet: CharacterSheet = {
              ...(existingSheet ?? {}),
              ...(nextSheet ?? {}),
              ...(rawSheet ?? {}),
              profileId: pid,
              scenarioId: sid,
              createdAt: (rawSheet as any)?.createdAt
                ? new Date((rawSheet as any).createdAt).toISOString()
                : (rawSheet as any)?.created_at
                  ? new Date((rawSheet as any).created_at).toISOString()
                  : createdAtLocal,
              updatedAt: (rawSheet as any)?.updatedAt
                ? new Date((rawSheet as any).updatedAt).toISOString()
                : (rawSheet as any)?.updated_at
                  ? new Date((rawSheet as any).updated_at).toISOString()
                  : now,
            } as any;

            sheets[pid] = mergedSheet as any;

            const finalPostId = String(rawPost?.id ?? postId);
            posts[finalPostId] = {
              ...(posts[finalPostId] ?? {}),
              id: finalPostId,
              scenarioId: String(rawPost?.scenarioId ?? rawPost?.scenario_id ?? sid),
              authorProfileId: String(rawPost?.authorProfileId ?? rawPost?.author_profile_id ?? gmId),
              text: String(rawPost?.text ?? postText ?? ""),
              createdAt: createdAtIso,
              insertedAt: insertedAtIso,
              updatedAt: rawPost?.updatedAt
                ? new Date(rawPost.updatedAt).toISOString()
                : rawPost?.updated_at
                  ? new Date(rawPost.updated_at).toISOString()
                  : now,
              postType: rawPost?.postType ?? rawPost?.post_type ?? "gm",
              meta: rawPost?.meta,
              isPinned: rawPost?.isPinned ?? rawPost?.is_pinned,
              pinOrder: rawPost?.pinOrder ?? rawPost?.pin_order,
            } as any;

            return { ...prev, sheets: sheets as any, posts } as any;
          });

          setState({ isReady: true, db: nextDb as any });
          return { postId: String(rawPost?.id ?? postId) };
        }

        const nextDb = await updateDb((prev) => {
          const prevSheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
          const existing = (prevSheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);

          const createdAt = (existing as any)?.createdAt ?? now;

          const savedSheet: CharacterSheet = {
            ...(existing ?? {}),
            ...(nextSheet ?? {}),
            profileId: pid,
            scenarioId: sid,
            createdAt,
            updatedAt: now,
          } as any;

          prevSheets[pid] = savedSheet as any;

          const newPost: Post = {
            id: postId,
            scenarioId: sid,
            authorProfileId: gmId,
            text: String(postText ?? ""),
            createdAt: now,
            insertedAt: now,
          } as any;

          return {
            ...prev,
            sheets: prevSheets as any,
            posts: {
              ...prev.posts,
              [postId]: newPost as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
        return { postId };
      },

      // --- import/export
      importScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        if (!db) return { ok: false, error: "DB not ready" };
        if (!auth.isReady) return { ok: false, error: "Auth not ready" };
        if (!currentUserId) return { ok: false, error: "Not signed in" };

        const now = Date.now();
        const cachedOk =
          importPickCacheRef.current && now - importPickCacheRef.current.pickedAtMs < 30_000;

        const picked = cachedOk
          ? {
              ok: true as const,
              raw: importPickCacheRef.current!.raw,
              jsonBytes: importPickCacheRef.current!.jsonBytes,
              fileName: importPickCacheRef.current!.fileName,
              uri: importPickCacheRef.current!.uri,
            }
          : await pickScenarioExportJson();

        // prevent accidental reuse
        importPickCacheRef.current = null;

        if (!picked.ok) return picked;

        const res = importScenarioFromJson(picked.raw, {
          db,
          currentUserId,
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
          forceNewScenarioId: true,
        });

        if (!res.ok) return res;

        // persist
        await writeDb(res.nextDb); // OR updateDb(() => res.nextDb)
        setState({ isReady: true, db: res.nextDb });

        return {
          ok: true,
          scenarioId: res.imported.scenarioId,
          importedProfiles: res.imported.profiles,
          importedPosts: res.imported.posts,
          renamedHandles: res.imported.renamedHandles,
        };
      },

      exportScenarioToFile: async ({ scenarioId, includeProfiles, includePosts, includeReposts, includeSheets, profileIds }) => {
        try {
          if (!db) return { ok: false, error: "DB not ready" };

          const scope = {
            includeProfiles,
            includePosts,
            includeReposts,
            includeSheets,
            exportAllProfiles: !profileIds || profileIds.length === 0,
            selectedProfileIds: profileIds ?? [],
          };

          const bundle = buildScenarioExportBundleV1(db, scenarioId, scope);

          const { uri, filename } = await saveAndShareScenarioExport(bundle);

          const counts = {
            profiles: bundle.profiles?.length ?? 0,
            posts: bundle.posts?.length ?? 0,
            reposts: bundle.reposts?.length ?? 0,
            sheets: bundle.sheets?.length ?? 0,
          };

          return { ok: true, uri, filename, counts };
        } catch (e: any) {
          return { ok: false, error: String(e?.message ?? e) };
        }
      },

      previewImportScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        if (!db) return { ok: false, error: "DB not ready" };
        if (!currentUserId) return { ok: false, error: "Not signed in" };

        const picked = await pickScenarioExportJson();
        if (!picked.ok) return picked;

        importPickCacheRef.current = {
          pickedAtMs: Date.now(),
          raw: picked.raw,
          jsonBytes: picked.jsonBytes,
          fileName: picked.fileName,
          uri: picked.uri,
        };

        const res = importScenarioFromJson(picked.raw, {
          db,
          currentUserId,
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
          forceNewScenarioId: true,
        });

        if (!res.ok) return res;

        return {
          ok: true,
          fileName: picked.fileName,
          jsonBytes: picked.jsonBytes,
          preview: {
            willCreateNewScenarioId: true,
            importedProfiles: res.imported.profiles,
            importedPosts: res.imported.posts,
            importedReposts: res.imported.reposts,
            importedSheets: res.imported.sheets,
            renamedHandles: res.imported.renamedHandles,
            skipped: res.imported.skipped,
          },
        };
      },

      // --- scenario settings
      getScenarioSettings: (scenarioId: string) => {
        if (!db) return {};
        const sid = String(scenarioId ?? "").trim();
        return (db.scenarios?.[sid] as any)?.settings ?? {};
      },

      updateScenarioSettings: async (scenarioId: string, patch: any) => {
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return;

        const nextDb = await updateDb((prev) => {
          const current = prev.scenarios?.[sid];
          if (!current) return prev;

          const prevSettings = ((current as any).settings ?? {}) as Record<string, any>;
          const nextSettings = { ...prevSettings, ...(patch ?? {}) };

          const now = new Date().toISOString();

          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [sid]: {
                ...current,
                settings: nextSettings,
                updatedAt: now,
              } as any,
            },
          };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      // ===== DMs =====
      syncConversationsForScenario: async (scenarioId: string) => {
        await syncConversationsForScenarioImpl(String(scenarioId ?? ""));
      },

      syncProfilesForScenario: async (scenarioId: string) => {
        await syncProfilesForScenarioImpl(String(scenarioId ?? ""));
      },

      syncMessagesForConversation: async ({ scenarioId, conversationId, limit }) => {
        await syncMessagesForConversationImpl({ scenarioId: String(scenarioId ?? ""), conversationId: String(conversationId ?? ""), limit });
      },

      listConversationsForScenario: (scenarioId: string, profileId: string) => {
        if (!db) return [];
        const sid = String(scenarioId);
        const pid = String(profileId);
        const map = ((db as any).conversations ?? {}) as Record<string, Conversation>;

        // Fire-and-forget sync from backend.
        if (backendEnabled && sid) {
          syncConversationsForScenarioImpl(sid).catch(() => {
            // ignore
          });
        }

        return Object.values(map)
          .filter((c) => String((c as any).scenarioId) === sid)
          .filter((c) => Array.isArray((c as any).participantProfileIds) && (c as any).participantProfileIds.map(String).includes(pid))
          .sort(sortDescByLastMessageAtThenId);
      },

      listMessagesPage: ({ scenarioId, conversationId, limit = 30, cursor }: MessagesPageArgs) => {
        if (!db) return { items: [], nextCursor: null };
        const sid = String(scenarioId);
        const cid = String(conversationId);
        const map = ((db as any).messages ?? {}) as Record<string, Message>;

        let items = Object.values(map).filter(
          (m) => String((m as any).scenarioId) === sid && String((m as any).conversationId) === cid
        );

        items.sort(sortAscByCreatedAtThenIdGeneric);

        let startIndex = 0;
        if (cursor) {
          const idx = items.findIndex((m) => makeMessageCursor(m) === cursor);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const page = items.slice(startIndex, startIndex + limit);
        const next = page.length === limit ? makeMessageCursor(page[page.length - 1]) : null;

        return { items: page, nextCursor: next };
      },

      upsertConversation: async (c: Conversation) => {
        const convId = String((c as any).id ?? "").trim();
        const sid = String((c as any).scenarioId ?? "").trim();
        if (!convId || !sid) return;

        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const existing = conversations[convId];

          conversations[convId] = {
            ...(existing ?? {}),
            ...c,
            id: convId,
            scenarioId: sid,
            participantProfileIds: Array.isArray((c as any).participantProfileIds)
              ? (c as any).participantProfileIds.map(String).filter(Boolean)
              : ((existing as any)?.participantProfileIds ?? []),
            createdAt: (existing as any)?.createdAt ?? (c as any).createdAt ?? now,
            updatedAt: now,
          };

          return { ...(prev as any), conversations };
        });

        setState({ isReady: true, db: next as any });
      },

      updateConversationMeta: async ({ scenarioId, conversationId, title, avatarUrl }) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = String(conversationId ?? "").trim();
        if (!sid || !cid) return;

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) throw new Error("Missing backend auth");
          if (!isUuidLike(sid) || !isUuidLike(cid)) throw new Error("Invalid ids for backend mode");

          let nextAvatarUrl: string | null | undefined;
          if (avatarUrl === undefined) {
            nextAvatarUrl = undefined;
          } else if (avatarUrl === null) {
            nextAvatarUrl = null;
          } else {
            const trimmed = String(avatarUrl).trim();
            nextAvatarUrl = trimmed ? trimmed : null;
          }

          // If we have a local image uri, upload it to R2 first and persist the returned public URL.
          if (typeof nextAvatarUrl === "string" && nextAvatarUrl.length > 0 && !/^https?:\/\//i.test(nextAvatarUrl)) {
            const lower = nextAvatarUrl.toLowerCase();
            const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
            const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
            const form = new FormData();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.append("avatar", { uri: nextAvatarUrl, name: `conversation_${cid}_${Date.now()}.${ext}`, type } as any);

            const up = await apiFetch({
              path: `/conversations/${encodeURIComponent(cid)}/avatar`,
              token,
              init: {
                method: "POST",
                body: form as any,
              },
            });

            if (!up.ok) throw new Error((up.json as any)?.error ?? up.text ?? "Upload failed");
            const uploadedConversation = (up.json as any)?.conversation;
            if (uploadedConversation?.id) {
              await api.upsertConversation(uploadedConversation as any);
            }

            // Avatar is already persisted server-side; omit it from the meta PUT.
            nextAvatarUrl = undefined;
          }

          const body: any = {};
          if (title !== undefined) body.title = title;
          if (nextAvatarUrl !== undefined) body.avatarUrl = nextAvatarUrl;

          // If avatar was uploaded and there's no title change, we're done.
          if (Object.keys(body).length === 0) return;

          const res = await apiFetch({
            path: `/conversations/${encodeURIComponent(cid)}`,
            token,
            init: {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          });

          if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
          const c = (res.json as any)?.conversation;
          if (c?.id) {
            await api.upsertConversation(c as any);
          }
          return;
        }

        const next = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const existing = conversations[cid];
          if (!existing) return prev;
          if (String((existing as any).scenarioId ?? "") !== sid) return prev;

          const now = new Date().toISOString();

          const nextTitle = title == null ? undefined : String(title);
          const nextAvatarUrl = avatarUrl == null ? undefined : String(avatarUrl);

          conversations[cid] = {
            ...existing,
            title: nextTitle && nextTitle.trim() ? nextTitle.trim() : undefined,
            avatarUrl: nextAvatarUrl && nextAvatarUrl.trim() ? nextAvatarUrl.trim() : undefined,
            updatedAt: now,
          } as any;

          return { ...(prev as any), conversations };
        });

        setState({ isReady: true, db: next as any });
      },

      updateConversationParticipants: async ({ scenarioId, conversationId, participantProfileIds }) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = String(conversationId ?? "").trim();
        const ids = Array.from(new Set((participantProfileIds ?? []).map(String).map((s: string) => s.trim()).filter(Boolean))) as string[];

        if (!sid || !cid) return;
        if (ids.length < 1) return;

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) throw new Error("Missing backend auth");
          if (!isUuidLike(sid) || !isUuidLike(cid)) throw new Error("Invalid ids for backend mode");

          const res = await apiFetch({
            path: `/conversations/${encodeURIComponent(cid)}/participants`,
            token,
            init: {
              method: "PUT",
              body: JSON.stringify({ participantProfileIds: ids }),
            },
          });

          if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
          const c = (res.json as any)?.conversation;
          if (c?.id) {
            await api.upsertConversation(c as any);
          }
          return;
        }

        const next = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const existing = conversations[cid];
          if (!existing) return prev;
          if (String((existing as any).scenarioId ?? "") !== sid) return prev;

          const now = new Date().toISOString();

          conversations[cid] = {
            ...existing,
            participantProfileIds: ids,
            updatedAt: now,
          } as any;

          return { ...(prev as any), conversations };
        });

        setState({ isReady: true, db: next as any });
      },

      sendMessage: async ({
        scenarioId,
        conversationId,
        senderProfileId,
        text,
        imageUris,
        kind,
      }: {
        scenarioId: string;
        conversationId: string;
        senderProfileId: string;
        text: string;
        imageUris?: string[];
        kind?: string;
      }) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = String(conversationId ?? "").trim();
        const from = String(senderProfileId ?? "").trim();
        const body = String(text ?? "").trim();
        const kindVal = kind ? String(kind) : undefined;
        const images = Array.isArray(imageUris) ? imageUris.map(String).map((s) => s.trim()).filter(Boolean) : [];
        if (!sid || !cid || !from) return { ok: false, error: "Missing ids" };
        if (!body && images.length === 0) return { ok: false, error: "Message is empty" };

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) return { ok: false, error: "Missing backend auth" };
          if (!isUuidLike(sid) || !isUuidLike(cid) || !isUuidLike(from)) return { ok: false, error: "Invalid ids for backend mode" };

          const hasLocalImages = images.some((u) => !/^https?:\/\//i.test(u));

          const res = hasLocalImages
            ? await (async () => {
                const form = new FormData();
                form.append("senderProfileId", from);
            form.append("text", body);
            if (kindVal) form.append("kind", kindVal);

                let i = 0;
                for (const uri of images) {
                  if (!uri || /^https?:\/\//i.test(uri)) continue;
                  const lower = uri.toLowerCase();
                  const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
                  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  form.append("images", { uri, name: `dm_${cid}_${Date.now()}_${i}.${ext}`, type } as any);
                  i++;
                }

                return await apiFetch({
                  path: `/conversations/${encodeURIComponent(cid)}/messages`,
                  token,
                  init: {
                    method: "POST",
                    body: form as any,
                  },
                });
              })()
                : await apiFetch({
                path: `/conversations/${encodeURIComponent(cid)}/messages`,
                token,
                init: {
                  method: "POST",
                  body: JSON.stringify({ senderProfileId: from, text: body, kind: kindVal }),
                },
              });

          if (!res.ok) return { ok: false, error: (res.json as any)?.error ?? res.text ?? "Send failed" };
          const m = (res.json as any)?.message;
          const mid = String(m?.id ?? "").trim();
          if (!mid) return { ok: false, error: "Send failed" };

          const remoteImageUrls = coerceStringArray(m?.imageUrls ?? m?.image_urls);
          // If backend didn't include urls (or returned an unexpected shape), show local picked images for the sender.
          const localPickedImages = images.filter((u) => !/^https?:\/\//i.test(u));
          const imageUrlsForDb = remoteImageUrls.length > 0 ? remoteImageUrls : localPickedImages;

          const nextDb = await updateDb((prev) => {
            const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
            const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

            const createdAt = m?.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString();

            messages[mid] = {
              id: mid,
              scenarioId: sid,
              conversationId: cid,
              senderProfileId: from,
              text: String(m?.text ?? body),
              kind: String(m?.kind ?? m?.kind ?? kindVal ?? "text"),
              imageUrls: imageUrlsForDb,
              createdAt,
              updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : createdAt,
              editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : undefined,
            } as any;

            const conv = conversations[cid];
            if (conv && String((conv as any).scenarioId ?? "") === sid) {
              conversations[cid] = { ...conv, lastMessageAt: createdAt, updatedAt: new Date().toISOString() } as any;
            }

            return { ...(prev as any), conversations, messages } as any;
          });

          setState({ isReady: true, db: nextDb as any });
          return { ok: true, messageId: mid };
        }

        

        const now = new Date().toISOString();
        const messageId = uuidv4();

        const nextDb = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

          const conv = conversations[cid];
          if (!conv) return prev;
          if (String((conv as any).scenarioId ?? "") !== sid) return prev;

          messages[messageId] = {
            id: messageId,
            scenarioId: sid,
            conversationId: cid,
            senderProfileId: from,
            text: body,
            imageUrls: images,
            createdAt: now,
            updatedAt: now,
            editedAt: undefined,
          };

          conversations[cid] = { ...conv, lastMessageAt: now, updatedAt: now };

          return { ...(prev as any), conversations, messages };
        });

        setState({ isReady: true, db: nextDb as any });
        return { ok: true, messageId };
      },

      // Send typing events over the open websocket for this scenario.
      sendTyping: ({ scenarioId, conversationId, profileId, typing }: { scenarioId?: string; conversationId?: string; profileId?: string; typing?: boolean }) => {
          const sid = String(scenarioId ?? "").trim();
          if (!sid) return;
          try {
            const ws = wsConnectionsRef.current[sid];
            if (!ws) return;
            const payload: Record<string, unknown> = {
              scenarioId: sid,
              typing: Boolean(typing),
            };
            if (conversationId) payload.conversationId = String(conversationId);
            if (profileId) payload.profileId = String(profileId);
            const uid = String(currentUserId ?? "").trim();
            if (uid) payload.userId = uid;
            ws.send(JSON.stringify({ event: "typing", payload }));
          } catch {
            // ignore send errors
          }
        },

      updateMessage: async ({ scenarioId, messageId, text, senderProfileId }) => {
        const sid = String(scenarioId ?? "").trim();
        const mid = String(messageId ?? "").trim();
        const nextText = text == null ? undefined : String(text);
        const nextSender = senderProfileId == null ? undefined : String(senderProfileId);
        if (!sid || !mid) return;

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) throw new Error("Missing backend auth");
          if (!isUuidLike(sid) || !isUuidLike(mid)) throw new Error("Invalid ids for backend mode");

          const body: any = {};
          if (nextText !== undefined) body.text = nextText;
          if (nextSender !== undefined) body.senderProfileId = nextSender;

          const res = await apiFetch({
            path: `/messages/${encodeURIComponent(mid)}`,
            token,
            init: {
              method: "PUT",
              body: JSON.stringify(body),
            },
          });

          if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
          const m = (res.json as any)?.message;
          if (!m?.id) return;

          const nextDb = await updateDb((prev) => {
            const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
            const existing = messages[mid] ?? {};

            const createdAt = m?.createdAt
              ? new Date(m.createdAt).toISOString()
              : String((existing as any)?.createdAt ?? new Date().toISOString());

            messages[mid] = {
              ...(existing as any),
              id: String(m.id),
              scenarioId: String(m?.scenarioId ?? sid),
              conversationId: String(m?.conversationId ?? (existing as any)?.conversationId ?? ""),
              senderProfileId: String(m?.senderProfileId ?? (existing as any)?.senderProfileId ?? ""),
              text: String(m?.text ?? (existing as any)?.text ?? ""),
              createdAt,
              updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : new Date().toISOString(),
              editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : new Date().toISOString(),
            } as any;

            return { ...(prev as any), messages } as any;
          });

          setState({ isReady: true, db: nextDb as any });
          return;
        }

        const nextDb = await updateDb((prev) => {
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

          const existing = messages[mid];
          if (!existing) return prev;
          if (String((existing as any).scenarioId ?? "") !== sid) return prev;

          const now = new Date().toISOString();
          const patched: any = { ...existing };

          let changed = false;

          if (nextText !== undefined) {
            const body = nextText.trim();
            if (!body) return prev;
            if (String((existing as any).text ?? "") !== body) {
              patched.text = body;
              changed = true;
            }
          }

          if (nextSender !== undefined) {
            const from = nextSender.trim();
            if (!from) return prev;
            if (String((existing as any).senderProfileId ?? "") !== from) {
              patched.senderProfileId = from;
              changed = true;
            }
          }

          if (!changed) return prev;

          patched.updatedAt = now;
          patched.editedAt = now;
          messages[mid] = patched;

          return { ...(prev as any), messages };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      setViewingConversation: async (scenarioId: string, conversationId?: string | null) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = conversationId == null ? null : String(conversationId ?? "").trim();
        const next = await updateDb((prev) => ({
          ...prev,
          selectedConversationByScenario: {
            ...((prev as any).selectedConversationByScenario ?? {}),
            [sid]: cid,
          },
        }));
        setState({ isReady: true, db: next as any });
      },

      deleteMessage: async ({ scenarioId, messageId }) => {
        const sid = String(scenarioId ?? "").trim();
        const mid = String(messageId ?? "").trim();
        if (!sid || !mid) return;

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) throw new Error("Missing backend auth");
          if (!isUuidLike(sid) || !isUuidLike(mid)) throw new Error("Invalid ids for backend mode");

          const res = await apiFetch({
            path: `/messages/${encodeURIComponent(mid)}`,
            token,
            init: { method: "DELETE" },
          });
          if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Delete failed");
          // fall through to local removal below for immediate UI.
        }

        const nextDb = await updateDb((prev) => {
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

          const existing = messages[mid];
          if (!existing) return prev;
          if (String((existing as any).scenarioId ?? "") !== sid) return prev;

          const cid = String((existing as any).conversationId ?? "");
          delete messages[mid];

          const conv = conversations[cid];
          if (conv && String((conv as any).scenarioId ?? "") === sid) {
            let lastMessageAt: string | undefined = undefined;
            for (const m of Object.values(messages)) {
              if (String((m as any).scenarioId ?? "") !== sid) continue;
              if (String((m as any).conversationId ?? "") !== cid) continue;
              const createdAt = String((m as any).createdAt ?? "");
              if (!createdAt) continue;
              if (!lastMessageAt || createdAt.localeCompare(lastMessageAt) > 0) lastMessageAt = createdAt;
            }

            conversations[cid] = {
              ...conv,
              lastMessageAt,
              updatedAt: new Date().toISOString(),
            } as any;
          }

          return { ...(prev as any), conversations, messages };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      reorderMessagesInConversation: async ({ scenarioId, conversationId, orderedMessageIds }) => {
        const sid = String(scenarioId ?? "").trim();
        const cid = String(conversationId ?? "").trim();
        const ids = (orderedMessageIds ?? []).map(String).map((s) => s.trim()).filter(Boolean);
        if (!sid || !cid) return;
        if (ids.length < 2) return;

        const nextDb = await updateDb((prev) => {
          const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

          // validate ids belong to this conversation
          const existing: Message[] = [];
          for (const mid of ids) {
            const m = messages[mid];
            if (!m) return prev;
            if (String((m as any).scenarioId ?? "") !== sid) return prev;
            if (String((m as any).conversationId ?? "") !== cid) return prev;
            existing.push(m);
          }

          // choose a stable starting timestamp near the earliest existing message
          let startMs: number | null = null;
          for (const m of existing) {
            const ms = Date.parse(String((m as any).createdAt ?? ""));
            if (!Number.isFinite(ms)) continue;
            startMs = startMs == null ? ms : Math.min(startMs, ms);
          }
          if (startMs == null) startMs = Date.now();

          // rewrite createdAt to match new order (1s spacing)
          for (let i = 0; i < ids.length; i++) {
            const mid = ids[i];
            const m = messages[mid];
            if (!m) continue;
            messages[mid] = { ...m, createdAt: new Date(startMs + i * 1000).toISOString() };
          }

          const conv = conversations[cid];
          if (conv && String((conv as any).scenarioId ?? "") === sid) {
            const lastMessageAt = new Date(startMs + (ids.length - 1) * 1000).toISOString();
            conversations[cid] = { ...conv, lastMessageAt, updatedAt: new Date().toISOString() } as any;
          }

          return { ...(prev as any), conversations, messages };
        });

        setState({ isReady: true, db: nextDb as any });
      },

      // ===== DM helpers (for your “send as” UX) =====
      getConversationById: (conversationId: string) => {
        if (!db) return null;
        const id = String(conversationId ?? "").trim();
        if (!id) return null;
        return (((db as any).conversations ?? {}) as Record<string, Conversation>)[id] ?? null;
      },

      listSendAsProfilesForScenario: (scenarioId: string) => {
        if (!db) return { owned: [], public: [] };

        const sid = String(scenarioId ?? "").trim();
        const uid = String(currentUserId ?? "").trim();
        if (!sid) return { owned: [], public: [] };

        const owned: Profile[] = [];
        const pub: Profile[] = [];

        for (const p of Object.values(db.profiles ?? {})) {
          if (String((p as any).scenarioId ?? "") !== sid) continue;
          const isPublic = Boolean((p as any).isPublic);
          if (uid && String((p as any).ownerUserId ?? "") === uid) owned.push(p);
          if (isPublic) pub.push(p); // include all shared profiles, even if owned by someone else
        }

        const byName = (a: Profile, b: Profile) =>
          String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? ""));

        owned.sort(byName);
        pub.sort(byName);

        return { owned, public: pub };
      },

      getOrCreateConversation: async (args) => {
        const { scenarioId, participantProfileIds, selectedProfileId } = args as any;
        const sid = String(scenarioId ?? "").trim();
        const ids = Array.from(new Set((participantProfileIds ?? []).map(String).map((s: string) => s.trim()).filter(Boolean))) as string[];

        if (!sid) return { ok: false, error: "scenarioId is required" };
        if (ids.length < 1) return { ok: false, error: "participantProfileIds must have 1+ ids" };

        if (backendEnabled) {
          const token = String(auth.token ?? "").trim();
          const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
          if (!token || !baseUrl) return { ok: false, error: "Missing backend auth" };
          if (!isUuidLike(sid)) return { ok: false, error: "Invalid scenarioId for backend mode" };

          // Use selectedProfileId passed in from caller
          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(sid)}/conversations:getOrCreate`,
            token,
            init: {
              method: "POST",
              body: JSON.stringify({ participantProfileIds: ids, selectedProfileId }),
            },
          });

          if (!res.ok) return { ok: false, error: (res.json as any)?.error ?? res.text ?? "Could not create" };
          const c = (res.json as any)?.conversation;
          const convId = String(c?.id ?? "").trim();
          if (!convId) return { ok: false, error: "Could not create" };

          await api.upsertConversation(c as any);
          return { ok: true, conversationId: convId };
        }

        // Local mode
        // Prefer existing conversation with the exact same participant set.
        const existingId = findConversationIdByExactParticipants(db as any, sid, ids as string[]);
        const convId = existingId ?? makeConversationId(sid);

        const now = new Date().toISOString();

        const next = await updateDb((prev) => {
          const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
          const existing = conversations[convId];

          if (!existing) {
            conversations[convId] = {
              id: convId,
              scenarioId: sid,
              participantProfileIds: (ids.slice().sort() as string[]),
              createdAt: now,
              updatedAt: now,
              lastMessageAt: undefined,
            };
          }

          return { ...(prev as any), conversations };
        });

        setState({ isReady: true, db: next as any });
        return { ok: true, conversationId: convId };
      },
    };
  }, [db, currentUserId, auth.isReady]);

  // Ensure realtime (WS) connections stay active even when the user is on the
  // scenario list or other screens. Without this, realtime/notifications can
  // appear to "turn off" until the Messages tab forces a conversations sync.
  const realtimeBootstrapRef = React.useRef<{ lastAttemptAtByScenario: Record<string, number> }>({
    lastAttemptAtByScenario: {},
  });

  React.useEffect(() => {
    if (!state.isReady || !state.db) return;
    if (!auth.isReady) return;

    const token = String(auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
    if (!token || !baseUrl) return;
    if (typeof WebSocket === "undefined") return;

    const uid = String(auth.userId ?? "").trim();
    if (!uid) return;

    const scenariosMap = (state.db as any)?.scenarios ?? {};
    const scenarios = Object.values(scenariosMap) as any[];
    const nowMs = Date.now();

    for (const s of scenarios) {
      const sid = String(s?.id ?? "").trim();
      if (!sid) continue;
      if (!isUuidLike(sid)) continue;

      const players = Array.isArray(s?.playerIds) ? s.playerIds.map(String).filter(Boolean) : [];
      if (players.length > 0 && !players.includes(uid)) continue;

      // If there's already a socket (open/connecting), don't spam sync.
      const existingWs = wsConnectionsRef.current?.[sid] ?? null;
      if (existingWs && (existingWs as any).readyState != null) {
        const rs = Number((existingWs as any).readyState);
        // 0 CONNECTING, 1 OPEN
        if (rs === 0 || rs === 1) continue;
      }

      const lastAt = realtimeBootstrapRef.current.lastAttemptAtByScenario[sid] ?? 0;
      if (nowMs - lastAt < 15_000) continue;
      realtimeBootstrapRef.current.lastAttemptAtByScenario[sid] = nowMs;

      try {
        void api.syncConversationsForScenario(sid).catch(() => {});
      } catch {}
    }
  }, [state.isReady, state.db, auth.isReady, auth.token, auth.userId, api, isUuidLike]);

  return <Ctx.Provider value={{ ...state, ...api }}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppData must be used within AppDataProvider");
  return v;
}

function likeKeyV1(profileId: string, postId: string) {
  return `${String(profileId)}|${String(postId)}`;
}
function likeKeyV2(scenarioId: string, profileId: string, postId: string) {
  return `${String(scenarioId)}|${String(profileId)}|${String(postId)}`;
}
function makeLikeId() {
  return `like_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function getLikesMap(db: DbV5 | null): Record<string, Like> {
  return ((db as any)?.likes ?? {}) as Record<string, Like>;
}

function makeMessageCursor(m: Message): MessageCursor {
  return `${String((m as any).createdAt ?? "")}|${String((m as any).id ?? "")}`;
}

function sortAscByCreatedAtThenIdGeneric(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  const c = String(a.createdAt).localeCompare(String(b.createdAt));
  if (c !== 0) return c;
  return String(a.id).localeCompare(String(b.id));
}

function sortDescByLastMessageAtThenId(a: Conversation, b: Conversation) {
  const aT = String((a as any).lastMessageAt ?? (a as any).updatedAt ?? (a as any).createdAt ?? "");
  const bT = String((b as any).lastMessageAt ?? (b as any).updatedAt ?? (b as any).createdAt ?? "");
  const c = bT.localeCompare(aT);
  if (c !== 0) return c;
  return String(b.id).localeCompare(String(a.id));
}

function makeConversationId(scenarioId: string) {
  void scenarioId;
  return uuidv4();
}

function findConversationIdByExactParticipants(db: DbV5 | null, scenarioId: string, participantProfileIds: string[]) {
  const sid = String(scenarioId ?? "").trim();
  const ids = Array.from(new Set((participantProfileIds ?? []).map(String).map((s) => s.trim()).filter(Boolean))).sort();
  if (!db || !sid || ids.length < 1) return null;

  const map = ((db as any).conversations ?? {}) as Record<string, Conversation>;
  for (const c of Object.values(map)) {
    if (String((c as any).scenarioId ?? "") !== sid) continue;
    const parts = Array.isArray((c as any).participantProfileIds)
      ? (c as any).participantProfileIds.map(String).filter(Boolean).sort()
      : [];
    if (parts.length !== ids.length) continue;
    let ok = true;
    for (let i = 0; i < ids.length; i++) {
      if (String(parts[i]) !== String(ids[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return String((c as any).id);
  }

  return null;
}