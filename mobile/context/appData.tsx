import AsyncStorage from "@react-native-async-storage/async-storage";

const EXPO_PUSH_TOKEN_STORAGE_KEY = "feedverse.push.expoPushToken";
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
  CharacterSheet,
  Like,
  Conversation,
  Message,
} from "@/data/db/schema";
import {
  rebuildFeedIndexFromDbAsync,
  getFeedIndexCountsSync,
  upsertPostsAsync,
  deletePostCascadeAsync,
  markSeenPostsAsync,
} from "@/data/db/sqliteStore";
import {
  getProfileByHandleSync,
  listConversationsForScenarioSync,
} from "@/data/db/sqliteCore";
import { readDb, subscribeDbChanges, updateDb, writeDb } from "@/data/db/storage";
import { seedDbIfNeeded } from "@/data/db/seed";
import { createScenarioImportExportApi } from "./appData/scenarioImportExport";
import { coerceStringArray } from "@/lib/utils/pgArrays";
import { conversationIdFromPathname, postIdFromPathname, scenarioIdFromPathname } from "@/lib/utils/idFromPathName";
import { useAuth } from "@/context/auth";
import { usePathname, useRouter } from "expo-router";
import { apiFetch } from "@/lib/api/apiClient";
// (scenario import/export delegated to ./appData/scenarioImportExport)
import BootSplash from "@/components/ui/BootSplash";

import { getActiveConversation, setActiveConversation } from "./appData/conversationView";
import { consumeScenarioFeedRefreshNeeded, markScenarioFeedRefreshNeeded } from "./appData/feedRefresh";
import { presentNotification, subscribeToNotifications, type AppNotification } from "./appData/notificationEvents";
import {
  defaultScenarioNotificationPrefsMobile,
  createScenarioNotificationPrefsApi,
  getScenarioNotificationPrefsFromDb,
  type ScenarioNotificationPrefs,
} from "./appData/scenarioNotificationPrefs";

// Preserve historical exports from this module.
export { getActiveConversation, setActiveConversation } from "./appData/conversationView";
export { consumeScenarioFeedRefreshNeeded, markScenarioFeedRefreshNeeded } from "./appData/feedRefresh";
export { presentNotification, subscribeToNotifications, type AppNotification } from "./appData/notificationEvents";
export {
  defaultScenarioNotificationPrefsMobile,
  getScenarioNotificationPrefsFromDb,
  type ScenarioNotificationPrefs,
} from "./appData/scenarioNotificationPrefs";

import { syncPostThreadForScenarioImpl } from "./appData/threadSync";
import { createSchedulePostsSync } from "./appData/postsSync";
import { syncProfilesForScenarioBackend } from "./appData/backendProfilesSync";
import { syncMessagesForConversationBackend } from "./appData/backendMessagesSync";
import { syncConversationsForScenarioBackend } from "./appData/backendConversationsSync";
import { createDmConversationsApi } from "./appData/dmConversations";
import { createDmMessagesApi } from "./appData/dmMessages";
import { createSendTyping } from "./appData/dmTyping";
import { createPinsApi } from "./appData/pins";
import { createScenarioSettingsApi } from "./appData/scenarioSettings";
import { createGmToolsApi } from "./appData/gmTools";
import { createLikesApi } from "./appData/likes";
import { createRepostsApi } from "./appData/reposts";
import { createScenariosApi } from "./appData/scenarios";
import { createCharacterSheetsApi } from "./appData/characterSheets";
import { createPagingApi } from "./appData/paging";


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
  syncScenarios: (opts?: { force?: boolean }) => Promise<void>;
  upsertScenario: (s: Scenario) => Promise<Scenario>;
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
  // fast-path: fetch a single thread from backend and hydrate local DB
  syncPostThreadForScenario: (scenarioId: string, rootPostId: string) => Promise<boolean>;

  // manual refresh hook for pull-to-refresh (forces sync, including replies)
  refreshPostsForScenario: (scenarioId: string) => void;

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

  // profile pins (one pinned post per profile)
  getPinnedPostIdForProfile: (profileId: string) => string | null;
  setPinnedPostForProfile: (args: {
    scenarioId: string;
    profileId: string;
    postId: string | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>; 

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
    | {
        ok: true;
        scenarioId: string;
        importedProfiles: number;
        importedPosts: number;
        importedSheets: number;
        renamedHandles: Array<{ from: string; to: string }>;
      }
    | { ok: false; error: string }
  >;
  exportScenarioToFile: (args: {
    scenarioId: string;
    includeProfiles: boolean;
    includePosts: boolean;
    includeSheets: boolean;
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

  // scenario notification prefs (backend mode)
  getScenarioNotificationPrefs: (scenarioId: string) => Promise<ScenarioNotificationPrefs | null>;
  updateScenarioNotificationPrefs: (scenarioId: string, patch: any) => Promise<ScenarioNotificationPrefs | null>;

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
    kind?: string;
    clientMessageId?: string;
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
  return () => {
    typingEventHandlers.delete(handler);
  };
}


const Ctx = React.createContext<(AppDataState & AppDataApi) | null>(null);

function normalizeHandle(input: string) {
  return String(input).trim().replace(/^@+/, "").toLowerCase();
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

      // Feed tables are the source of truth for paging; only rebuild on first-run/migration.
      try {
        if (db) {
          const counts = getFeedIndexCountsSync();
          const dbPostCount = Object.keys((db as any)?.posts ?? {}).length;
          if (counts.posts === 0 && dbPostCount > 0) {
            await rebuildFeedIndexFromDbAsync(db);
          }
        }
      } catch {
        // ignore
      }
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
  const pathname = usePathname();
  const dbReady = Boolean(state.db);

  const pathnameRef = React.useRef<string>("");
  React.useEffect(() => {
    pathnameRef.current = String(pathname ?? "");
  }, [pathname]);

  // Notification listener refs
  const notificationResponseListenerRef = React.useRef<any | null>(null);
  const notificationReceivedListenerRef = React.useRef<any | null>(null);
  const notificationNavRef = React.useRef<{ key: string; atMs: number } | null>(null);
  const notificationNavTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncPostThreadForScenario = React.useCallback<AppDataApi["syncPostThreadForScenario"]>(
    async (scenarioId, rootPostId) => {
      return syncPostThreadForScenarioImpl({
        scenarioId,
        rootPostId,
        db,
        auth,
        isUuidLike,
        serverSeenPostsRef,
        setState,
      });
    },
    [auth, db, isUuidLike],
  );

  // Request notification permissions and register handlers when ready
  React.useEffect(() => {
    if (!state.isReady || !dbReady) return;
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

        // Android: ensure a notification channel exists so notifications can display.
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Platform } = require("react-native");
          if (Platform?.OS === "android" && typeof Notifications.setNotificationChannelAsync === "function") {
            const importance = Notifications.AndroidImportance?.MAX ?? 5;
            const channel = await Notifications.setNotificationChannelAsync("default", {
              name: "default",
              importance,
            });
          }
        } catch {}

        // Ensure notifications show while foregrounded (optional)
        if (Notifications.setNotificationHandler) {
          try {
            Notifications.setNotificationHandler({
              handleNotification: async (notification: any) => {
                try {
                  const data = notification?.request?.content?.data ?? notification?.data ?? {};
                  const sid = String(data?.scenarioId ?? data?.scenario_id ?? "").trim();
                  const conv = String(data?.conversationId ?? data?.conversation_id ?? "").trim();
                  if (sid && conv) {
                    const viewing = getActiveConversation(sid);
                    if (viewing && String(viewing) === String(conv)) {
                      return {
                        // shouldShowAlert is deprecated; keep banner/list for new API.
                        shouldShowAlert: false,
                        shouldShowBanner: false,
                        shouldShowList: false,
                        shouldPlaySound: false,
                        shouldSetBadge: false,
                      };
                    }
                  }
                } catch {}

                return {
                  shouldShowAlert: true,
                  shouldShowBanner: true,
                  shouldShowList: true,
                  shouldPlaySound: false,
                  shouldSetBadge: false,
                };
              },
            });
          } catch {}
        }

        // Request permissions (best-effort)
        try {
          const before = await (Notifications.getPermissionsAsync?.() ?? Notifications.requestPermissionsAsync?.());
          const beforeStatus = before?.status ?? (before?.granted ? "granted" : undefined);
          if (beforeStatus !== "granted") {
            try {
              await Notifications.requestPermissionsAsync?.();
            } catch (e: any) {
              // ignore
            }
          }
        } catch {}

        // Best-effort: obtain device push token (APNS/FCM) to ensure credentials are wired.
        try {
          if (typeof Notifications.getDevicePushTokenAsync === "function") {
            await Notifications.getDevicePushTokenAsync();
          }
        } catch {}

        // In backend mode, register an Expo push token so the server can send
        // real remote notifications (works even when the app is closed).
        try {
          const token = String(auth.token ?? "").trim();
          if (isBackendMode(token) && token) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Constants = require("expo-constants");
            const projectId =
              Constants?.expoConfig?.extra?.eas?.projectId ??
              Constants?.easConfig?.projectId ??
              Constants?.expoConfig?.extra?.projectId;

            let expoPushToken = "";
            try {
              const res = await Notifications.getExpoPushTokenAsync?.(projectId ? { projectId } : undefined);
              expoPushToken = String(res?.data ?? "").trim();
            } catch {
              expoPushToken = "";
            }

            if (expoPushToken) {
              try {
                await AsyncStorage.setItem(EXPO_PUSH_TOKEN_STORAGE_KEY, expoPushToken);
              } catch {
                // ignore
              }

              let platform = "";
              try {
                // Prefer react-native Platform.OS; expo-constants platform fields can be missing
                // in some environments (e.g. newer Expo Go).
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { Platform } = require("react-native");
                platform = String(Platform?.OS ?? "");
              } catch {
                platform = "";
              }
              let regRes: any = null;
              try {
                regRes = await apiFetch({
                path: "/users/push-token",
                token,
                init: {
                  method: "POST",
                  body: JSON.stringify({ expoPushToken, platform: platform || undefined }),
                },
              });
              } catch (e: any) {
                // ignore
              }
              void regRes;
            }
          }
        } catch {
          // best-effort; don't block app startup if push registration fails
        }

        // Register response handler: navigate to conversation when tapped
        try {
          notificationResponseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
            try {
              const data = response?.notification?.request?.content?.data ?? response?.notification?.data ?? {};
              const sid = String(data?.scenarioId ?? data?.scenario_id ?? "");
              const conv = String(data?.conversationId ?? data?.conversation_id ?? "");
              const messageId = String(data?.messageId ?? data?.message_id ?? "").trim();
              const kind = String(data?.kind ?? "").trim();
              const postId = String(data?.postId ?? data?.post_id ?? "").trim();
              const parentPostId = String(data?.parentPostId ?? data?.parent_post_id ?? "").trim();
              const rootPostId = String(data?.rootPostId ?? data?.root_post_id ?? "").trim();
              const targetProfileId = String(data?.profileId ?? data?.profile_id ?? "").trim();

              // ---- Post deep-link (open post) ----
              if (sid && postId) {
                let focusPostId = "";
                let destPostId = postId;

                // If the notification is for a reply (or the target post itself is a reply),
                // open the thread root and highlight the reply.
                try {
                  const postsMap = (state.db as any)?.posts ?? {};

                  const local = postsMap?.[postId];
                  const localParent = String(local?.parentPostId ?? local?.parent_post_id ?? "").trim();
                  const payloadParent = String(parentPostId ?? "").trim();
                  const isReplyLike = kind === "reply" || Boolean(localParent) || Boolean(payloadParent);

                  if (isReplyLike) {
                    focusPostId = postId;
                    destPostId = rootPostId || payloadParent || localParent || postId;

                    // Best-effort: walk up parent chain from the actual post id.
                    let curId = String(postId);
                    const seen = new Set<string>();
                    for (let i = 0; i < 50; i++) {
                      if (!curId || seen.has(curId)) break;
                      seen.add(curId);
                      const cur = postsMap?.[curId];
                      if (!cur) break;
                      const ppid = String(cur?.parentPostId ?? cur?.parent_post_id ?? "").trim();
                      if (!ppid) {
                        destPostId = curId;
                        break;
                      }
                      curId = ppid;
                    }
                  }
                } catch {
                  // best-effort
                  if (kind === "reply") focusPostId = postId;
                  if (kind === "reply") destPostId = rootPostId || parentPostId || postId;
                }
                // Switch selection first (even if we skip navigation).
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

                // If we're already at the destination post, do nothing (but still trigger focus).
                try {
                  const curPath = String(pathnameRef.current ?? "");
                  const curSid = scenarioIdFromPathname(curPath);
                  const curPost = postIdFromPathname(curPath);
                  if (curSid && String(curSid) === String(sid) && curPost && String(curPost) === String(destPostId)) {
                    if (focusPostId) {
                      try { router.setParams({ focusPostId } as any); } catch {}
                    }
                    return;
                  }
                } catch {}

                // Dedupe: mention pushes can be tapped multiple times or callbacks can double-fire.
                try {
                  const key = `${sid}|post|${destPostId}|${focusPostId}|${targetProfileId}`;
                  const nowMs = Date.now();
                  const last = notificationNavRef.current;
                  if (last && last.key === key && nowMs - last.atMs < 2500) return;
                  notificationNavRef.current = { key, atMs: nowMs };

                  if (notificationNavTimerRef.current) {
                    clearTimeout(notificationNavTimerRef.current);
                    notificationNavTimerRef.current = null;
                  }
                } catch {}

                notificationNavTimerRef.current = setTimeout(async () => {
                  if (cancelled) return;
                  try {
                    const currentPath = String(pathnameRef.current ?? "");
                    const fromScenarioList = currentPath === "/" || currentPath === "";

                    const curSid = scenarioIdFromPathname(currentPath);
                    const sameScenario = Boolean(curSid && String(curSid) === String(sid));
                    const inHome = String(currentPath).split("/").includes("home");
                    const curPost = postIdFromPathname(currentPath);

                    const stepHome = {
                      pathname: "/(scenario)/[scenarioId]/(tabs)/home",
                      params: { scenarioId: sid },
                    } as any;
                    const stepPost = {
                      pathname: "/(scenario)/[scenarioId]/(tabs)/home/post/[postId]",
                      params: { scenarioId: sid, postId: destPostId, ...(focusPostId ? { focusPostId } : {}) },
                    } as any;

                    // Fast-path: hydrate thread before navigation so content is ready.
                    // Keep this bounded so navigation never feels blocked.
                    try {
                      const timeoutMs = 600;
                      await Promise.race([
                        syncPostThreadForScenario(sid, destPostId),
                        new Promise((r) => setTimeout(r, timeoutMs)),
                      ]);
                    } catch {}

                    // Smart routing:
                    // - Same scenario:
                    //   - already in home tab:
                    //     - from a different post thread => replace
                    //     - from the home feed list => push
                    //   - from another tab => push directly to the post (keeps back to current tab)
                    // - Different scenario:
                    //   - scenario list => push home then push post (keeps back)
                    //   - inside another scenario => replace home then push post
                    if (sameScenario) {
                      if (inHome) {
                        if (curPost) {
                          try { router.replace(stepPost); } catch {}
                        } else {
                          try { router.push(stepPost); } catch {}
                        }
                      } else {
                        try { router.push(stepPost); } catch {}
                      }
                      return;
                    }

                    if (fromScenarioList) {
                      router.push(stepHome);
                      setTimeout(() => {
                        try { router.push(stepPost); } catch {}
                      }, 0);
                    } else {
                      router.replace(stepHome);
                      setTimeout(() => {
                        try { router.push(stepPost); } catch {}
                      }, 0);
                    }
                  } catch {}
                }, 0);

                return;
              }

              // ---- Message deep-link (open conversation) ----
              if (sid && conv) {
                // If notification is for a specific owned profile, switch selection first.
                // Do this even if we end up skipping navigation because we're already at the destination.
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

                // If we're already viewing this conversation, do nothing.
                try {
                  const viewing = getActiveConversation(sid);
                  if (viewing && String(viewing) === String(conv)) return;
                } catch {}

                // If our current path already points at the same destination, do nothing.
                try {
                  const curPath = String(pathnameRef.current ?? "");
                  const curSid = scenarioIdFromPathname(curPath);
                  const curConv = conversationIdFromPathname(curPath);
                  if (curSid && String(curSid) === String(sid) && curConv && String(curConv) === String(conv)) return;
                } catch {}

                // Dedupe: some environments/devices can fire multiple response callbacks
                // for a single tap (or our navigation can retrigger handlers on remount).
                // Prevent repeated replace/push loops.
                try {
                  // Prefer payload-based dedupe keys (notification identifiers can differ
                  // across platforms / delivery mechanisms for the same tap).
                  const key = `${sid}|${conv}|${messageId || ""}|${targetProfileId}`;
                  const nowMs = Date.now();
                  const last = notificationNavRef.current;
                  if (last && last.key === key && nowMs - last.atMs < 2500) return;
                  notificationNavRef.current = { key, atMs: nowMs };

                  if (notificationNavTimerRef.current) {
                    clearTimeout(notificationNavTimerRef.current);
                    notificationNavTimerRef.current = null;
                  }
                } catch {}

                // Navigate via the inbox screen so it can sync state before opening the thread.
                // Jumping directly to the thread can land on an infinite loading state if the
                // conversation/messages haven't been synced yet.
                try {
                  // Use replace (not push) so the app's active tab navigator
                  // becomes the notification's scenario. Avoid dismissAll(): it
                  // can dispatch POP_TO_TOP when no stack is present.
                  notificationNavTimerRef.current = setTimeout(() => {
                    if (cancelled) return;
                    try {
                      const currentPath = String(pathnameRef.current ?? "");
                      const fromScenarioList = currentPath === "/" || currentPath === "";

                      const curSid = scenarioIdFromPathname(currentPath);
                      const curConv = conversationIdFromPathname(currentPath);
                      const inMessages = String(currentPath).split("/").includes("messages");
                      const sameScenario = Boolean(curSid && String(curSid) === String(sid));
                      const stepHome = {
                        pathname: "/(scenario)/[scenarioId]/(tabs)/home",
                        params: { scenarioId: sid },
                      } as any;

                      const stepMessagesOpen = {
                        pathname: "/(scenario)/[scenarioId]/(tabs)/messages",
                        params: { scenarioId: sid, openConversationId: conv },
                      } as any;

                      const stepConversation = {
                        pathname: "/(scenario)/[scenarioId]/(tabs)/messages/[conversationId]",
                        params: { scenarioId: sid, conversationId: conv },
                      } as any;

                      // Smart routing:
                      // - If already in the same scenario + inside Messages, go straight to the conversation.
                      //   - from list => push (so back goes to list)
                      //   - from another thread => replace (so back goes to list, not the previous thread)
                      // - If same scenario but different tab (home feed / search / notifications), go to messages
                      //   with openConversationId so the inbox can sync before opening.
                      // - If different scenario (or coming from scenario list), do the full route: home -> messages.
                      if (sameScenario) {
                        if (inMessages) {
                          if (curConv) {
                            try { router.replace(stepConversation); } catch {}
                          } else {
                            try { router.push(stepConversation); } catch {}
                          }
                        } else {
                          // Preserve back to whatever screen/tab the user was on.
                          try { router.push(stepMessagesOpen); } catch {}
                        }
                        return;
                      }

                      if (fromScenarioList) {
                        // Preserve back navigation to scenario list.
                        router.push(stepHome);
                        setTimeout(() => {
                          try { router.replace(stepMessagesOpen); } catch {}
                        }, 0);
                      } else {
                        // Replace to avoid stacking scenarios.
                        router.replace(stepHome);
                        setTimeout(() => {
                          try { router.replace(stepMessagesOpen); } catch {}
                        }, 0);
                      }
                    } catch {}
                  }, 0);
                } catch {}
              }
            } catch {}
          });
        } catch {}

        // Register received handler: fires while app is foregrounded.
        try {
          notificationReceivedListenerRef.current = Notifications.addNotificationReceivedListener((notif: any) => {
            try {
              const data = notif?.request?.content?.data ?? notif?.data ?? {};
              const sid = String(data?.scenarioId ?? data?.scenario_id ?? "").trim();
              const kind = String(data?.kind ?? "").trim();
              const postId = String(data?.postId ?? data?.post_id ?? "").trim();
              const parentPostId = String(data?.parentPostId ?? data?.parent_post_id ?? "").trim();
              const rootPostId = String(data?.rootPostId ?? data?.root_post_id ?? "").trim();

              if (!sid || !postId) return;

              const dest = kind === "reply" ? (rootPostId || parentPostId || postId) : postId;
              void syncPostThreadForScenario(sid, dest);
            } catch {
              // ignore
            }
          });
        } catch {}
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (notificationNavTimerRef.current) {
          clearTimeout(notificationNavTimerRef.current);
          notificationNavTimerRef.current = null;
        }
      } catch {}
      try { notificationResponseListenerRef.current?.remove?.(); } catch {}
      try { notificationReceivedListenerRef.current?.remove?.(); } catch {}
    };
  }, [state.isReady, dbReady, auth.isReady, router]);

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

  const scenariosSyncRef = React.useRef<{ token: string | null; inFlight: boolean; lastSyncAt: number }>({
    token: null,
    inFlight: false,
    lastSyncAt: 0,
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
    backfillCursorByScenario: Record<string, string | null>;
  }>({
    inFlightByScenario: {},
    lastSyncAtByScenario: {},
    backfillCursorByScenario: {},
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

  // Throttle WS bootstrap attempts from typing events.
  const typingWsBootstrapRef = React.useRef<{ lastAttemptAtByScenario: Record<string, number> }>({
    lastAttemptAtByScenario: {},
  });

  const messagesSyncRef = React.useRef<{
    inFlightByConversation: Record<string, boolean>;
    lastSyncAtByConversation: Record<string, number>;
  }>({
    inFlightByConversation: {},
    lastSyncAtByConversation: {},
  });

  const syncScenariosFromBackend = React.useCallback(
    async (opts?: { force?: boolean }) => {
      if (!state.isReady || !state.db) return;
      if (!auth.isReady) return;

      const token = String(auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return;

      const force = Boolean(opts?.force);
      const nowMs = Date.now();

      if (scenariosSyncRef.current.inFlight) return;
      if (!force && scenariosSyncRef.current.token === token) return; // already synced for this session token

      // When forced, still throttle so we don't spam the backend.
      if (force && nowMs - (scenariosSyncRef.current.lastSyncAt || 0) < 15_000) return;

      scenariosSyncRef.current.inFlight = true;
      try {
        const [res, tagsRes] = await Promise.all([
          apiFetch({ path: "/scenarios", token }),
          apiFetch({ path: "/global-tags", token }),
        ]);
        if (!res.ok || !Array.isArray(res.json)) return;

        const rows = res.json as any[];
        const globalTagRows = tagsRes.ok && Array.isArray(tagsRes.json) ? (tagsRes.json as any[]) : [];
        const nowIso = new Date().toISOString();

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
                  : (nextTags[key]?.createdAt ?? nowIso),
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
            const hasPlayerIds = Array.isArray(playerIdsRaw);
            const playerIds = hasPlayerIds ? playerIdsRaw.map(String) : undefined;

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
              mode: raw?.mode === "campaign" || raw?.mode === "story" ? raw.mode : (existing?.mode ?? "story"),
              // IMPORTANT: empty arrays are meaningful (e.g. you left and you're no longer a member).
              // Only fall back when the field is absent.
              playerIds: hasPlayerIds ? (playerIds ?? []) : (existing?.playerIds ?? []),
              tags: Array.isArray(raw?.tags) ? raw.tags : (existing?.tags ?? []),
              gmUserIds: gmUserIds ?? (existing as any)?.gmUserIds,
              settings: settings ?? (existing as any)?.settings,
              createdAt: raw?.created_at
                ? new Date(raw.created_at).toISOString()
                : raw?.createdAt
                  ? new Date(raw.createdAt).toISOString()
                  : (existing?.createdAt ?? nowIso),
              updatedAt: raw?.updated_at
                ? new Date(raw.updated_at).toISOString()
                : raw?.updatedAt
                  ? new Date(raw.updatedAt).toISOString()
                  : nowIso,
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
        scenariosSyncRef.current.lastSyncAt = nowMs;
      } finally {
        scenariosSyncRef.current.inFlight = false;
      }
    },
    [state.isReady, state.db, auth.isReady, auth.token]
  );

  // If backend auth is enabled, fetch scenarios from server and merge into local DB.
  React.useEffect(() => {
    void syncScenariosFromBackend({ force: false });
  }, [syncScenariosFromBackend]);

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
      await syncProfilesForScenarioBackend({
        scenarioId,
        env: { backendEnabled, isUuidLike },
        auth,
        providerState: state,
        profilesSyncRef,
        setState,
      });
    };

    const syncConversationsForScenarioImpl = async (scenarioId: string) => {
      await syncConversationsForScenarioBackend({
        scenarioId,
        env: { backendEnabled, isUuidLike, isBackendMode },
        auth,
        providerState: state,
        conversationsSyncRef,
        wsConnectionsRef,
        messageEventHandlers,
        typingEventHandlers,
        setState,
      });
    };

    const syncMessagesForConversationImpl = async (args: { scenarioId: string; conversationId: string; limit?: number }) => {
      await syncMessagesForConversationBackend({
        scenarioId: String(args.scenarioId ?? ""),
        conversationId: String(args.conversationId ?? ""),
        limit: args.limit,
        env: { backendEnabled, isUuidLike },
        auth,
        providerState: state,
        messagesSyncRef,
        setState,
      });
    };

    const dmConversationsApi = createDmConversationsApi({
      env: { backendEnabled, isUuidLike },
      auth,
      currentUserId,
      getDb: () => db,
      setState,
      findConversationIdByExactParticipants,
      makeConversationId,
    });

    const dmMessagesApi = createDmMessagesApi({
      env: { backendEnabled, isUuidLike },
      auth,
      currentUserId,
      getDb: () => db,
      setState,
    });

    const sendTyping = createSendTyping({
      currentUserId,
      wsConnectionsRef,
      typingWsBootstrapRef,
      syncConversationsForScenario: syncConversationsForScenarioImpl,
    });

    const scenarioImportExportApi = createScenarioImportExportApi({
      getDb: () => db,
      setState,
      auth,
      currentUserId,
      isUuidLike,
      isBackendMode,
      serverSeenPostsRef,
      importPickCacheRef,
    });

    const scenarioNotificationPrefsApi = createScenarioNotificationPrefsApi({
      getDb: () => db,
      setState,
      auth,
      isBackendEnabled: () => backendEnabled,
      isUuidLike,
    });

    const pinsApi = createPinsApi({
      getDb: () => db,
      setState,
      auth,
      currentUserId,
      isUuidLike,
    });

    const scenarioSettingsApi = createScenarioSettingsApi({
      getDb: () => db,
      setState,
    });

    const gmToolsApi = createGmToolsApi({
      setState,
      auth,
      currentUserId,
      isUuidLike,
      isBackendMode,
      serverSeenPostsRef,
    });

    const likesApi = createLikesApi({
      getDb: () => db,
      setState,
      auth,
    });

    const repostsApi = createRepostsApi({
      getDb: () => db,
      setState,
      auth,
    });

    const scenariosApi = createScenariosApi({
      getDb: () => db,
      setState,
      auth,
      currentUserId,
      isUuidLike,
      markProfilesSyncStale: (scenarioId: string) => {
        profilesSyncRef.current.lastSyncAtByScenario[String(scenarioId)] = 0;
      },
    });

    const characterSheetsApi = createCharacterSheetsApi({
      getDb: () => db,
      setState,
      auth,
    });

    const schedulePostsSync = createSchedulePostsSync({
      getDb: () => db,
      auth,
      backendEnabled,
      isUuidLike,
      postsSyncRef,
      serverSeenPostsRef,
      setState,
      likeKeyV2,
    });

    const pagingApi = createPagingApi({
      getDb: () => db,
      backendEnabled,
      isUuidLike,
      schedulePostsSync,
      getSeenPostsByScenario: (scenarioId: string) => {
        return serverSeenPostsRef.current.byScenario[String(scenarioId)] ?? {};
      },
    });

    return {
      // --- profiles
      getProfileById: (id) => (db ? db.profiles[String(id)] ?? null : null),

      getProfileByHandle: (scenarioId, handle) => {
        if (!db) return null;
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return null;

        try {
          const p = getProfileByHandleSync(sid, String(handle ?? ""));
          if (p?.id) return (db as any)?.profiles?.[String(p.id)] ?? p;
        } catch {
          return null;
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

      syncPostThreadForScenario,

      refreshPostsForScenario: (scenarioId: string) => {
        const sid = String(scenarioId ?? "").trim();
        if (!sid) return;

        // Only meaningful in backend mode; schedulePostsSync already no-ops otherwise.
        try {
          postsSyncRef.current.lastSyncAtByScenario[sid] = 0;
          delete postsSyncRef.current.backfillCursorByScenario[sid];
        } catch {
          // ignore
        }

        try {
          schedulePostsSync(sid);
        } catch {
          // ignore
        }
      },

      // generic paged posts (feed)
      listPostsPage: pagingApi.listPostsPage,

      // profile feed page
      listProfileFeedPage: pagingApi.listProfileFeedPage,

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

          // Optimistic: write locally immediately so the composer can close instantly.
          // In backend mode, feeds are filtered to posts we've "seen" from the server,
          // so we also mark this post as seen right away.
          const pLocal = { ...(p as any), id, scenarioId: sid, authorProfileId } as any;
          const parentPostId = pLocal?.parentPostId ? String(pLocal.parentPostId) : "";

          const nextLocal = await updateDb((prev) => {
            const existing = (prev.posts as any)?.[id];

            const insertedAt = (existing as any)?.insertedAt ?? (pLocal as any).insertedAt ?? now;
            const createdAt = (pLocal as any).createdAt ?? (existing as any)?.createdAt ?? now;

            const posts = {
              ...prev.posts,
              [id]: {
                ...(existing ?? {}),
                ...pLocal,
                id,
                insertedAt,
                createdAt,
                updatedAt: now,
              },
            } as any;

            // If this is a reply, bump parent.replyCount optimistically.
            if (parentPostId && posts[parentPostId]) {
              const parent = posts[parentPostId];
              posts[parentPostId] = {
                ...parent,
                replyCount: Math.max(0, Number((parent as any).replyCount ?? 0) + 1),
                updatedAt: now,
              } as any;
            }

            return { ...prev, posts };
          });

          try {
            const seen = (serverSeenPostsRef.current.byScenario[sid] ??= {});
            if (id) seen[id] = true;
          } catch {}

          // Keep SQL index in sync BEFORE setState so SQL-backed paging sees the optimistic post.
          try {
            await markSeenPostsAsync(sid, [id]);
            const row = (nextLocal as any)?.posts?.[id] ?? null;
            if (row) await upsertPostsAsync([row]);

            if (parentPostId) {
              const parentRow = (nextLocal as any)?.posts?.[parentPostId] ?? null;
              if (parentRow) await upsertPostsAsync([parentRow]);
            }
          } catch {
            // ignore
          }

          setState({ isReady: true, db: nextLocal as any });

          const rawImageUrls = Array.isArray((p as any)?.imageUrls) ? (p as any).imageUrls.map(String).filter(Boolean) : [];
          const localImageUris = rawImageUrls.filter((u: string) => !/^https?:\/\//i.test(u));
          const remoteImageUrls = rawImageUrls.filter((u: string) => /^https?:\/\//i.test(u));

          // Fire-and-forget backend write + image upload. If it fails, keep the optimistic post.
          void (async () => {
            const res = await apiFetch({
              path: `/scenarios/${encodeURIComponent(sid)}/posts`,
              token,
              init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id,
                  authorProfileId,
                  text: (pLocal as any)?.text,
                  imageUrls: remoteImageUrls,
                  replyCount: (pLocal as any)?.replyCount,
                  repostCount: (pLocal as any)?.repostCount,
                  likeCount: (pLocal as any)?.likeCount,
                  parentPostId: (pLocal as any)?.parentPostId,
                  quotedPostId: (pLocal as any)?.quotedPostId,
                  insertedAt: (pLocal as any)?.insertedAt,
                  createdAt: (pLocal as any)?.createdAt,
                  postType: (pLocal as any)?.postType,
                  meta: (pLocal as any)?.meta,
                  isPinned: (pLocal as any)?.isPinned,
                  pinOrder: (pLocal as any)?.pinOrder,
                }),
              },
            });

            if (!res.ok) return;

            const createdPostId = String((res.json as any)?.post?.id ?? id);
            if (sid && createdPostId) {
              const seen = (serverSeenPostsRef.current.byScenario[sid] ??= {});
              seen[createdPostId] = true;
            }

            let raw = (res.json as any)?.post ?? null;

            // If there are local images, upload them to R2 and persist returned URLs.
            if (createdPostId && localImageUris.length > 0) {
              const form = new FormData();
              for (let i = 0; i < localImageUris.length; i++) {
                const uri = String(localImageUris[i]);
                const name = `post_${createdPostId}_${i}_${Date.now()}.jpg`;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                form.append("images", { uri, name, type: "image/jpeg" } as any);
              }

              const up = await apiFetch({
                path: `/posts/${encodeURIComponent(createdPostId)}/images`,
                token,
                init: {
                  method: "POST",
                  body: form as any,
                },
              });

              if (up.ok) {
                raw = (up.json as any)?.post ?? raw;
              }
            }

            if (!raw) return;

            const postId = String(raw?.id ?? createdPostId ?? id);
            const nextDb = await updateDb((prev) => {
              const posts = { ...(prev.posts ?? {}) } as any;

              if (postId && postId !== id && posts[id]) delete posts[id];

              const existing = posts[postId] ?? {};
              posts[postId] = {
                ...existing,
                ...pLocal,
                id: postId,
                scenarioId: String(raw?.scenarioId ?? (pLocal as any)?.scenarioId ?? sid),
                authorProfileId: String(raw?.authorProfileId ?? (pLocal as any)?.authorProfileId ?? ""),
                authorUserId:
                  String(raw?.authorUserId ?? raw?.author_user_id ?? (pLocal as any)?.authorUserId ?? existing?.authorUserId ?? "")
                    .trim() || undefined,
                text: String(raw?.text ?? (pLocal as any)?.text ?? ""),
                imageUrls: Array.isArray(raw?.imageUrls)
                  ? raw.imageUrls.map(String).filter(Boolean)
                  : Array.isArray((pLocal as any)?.imageUrls)
                    ? (pLocal as any).imageUrls.map(String).filter(Boolean)
                    : (existing?.imageUrls ?? []),
                replyCount: Number(raw?.replyCount ?? (pLocal as any)?.replyCount ?? existing?.replyCount ?? 0),
                repostCount: Number(raw?.repostCount ?? (pLocal as any)?.repostCount ?? existing?.repostCount ?? 0),
                likeCount: Number(raw?.likeCount ?? (pLocal as any)?.likeCount ?? existing?.likeCount ?? 0),
                parentPostId: raw?.parentPostId ?? (pLocal as any)?.parentPostId ?? existing?.parentPostId,
                quotedPostId: raw?.quotedPostId ?? (pLocal as any)?.quotedPostId ?? existing?.quotedPostId,
                insertedAt: raw?.insertedAt ? new Date(raw.insertedAt).toISOString() : ((pLocal as any)?.insertedAt ?? existing?.insertedAt ?? now),
                createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : ((pLocal as any)?.createdAt ?? existing?.createdAt ?? now),
                updatedAt: raw?.updatedAt ? new Date(raw.updatedAt).toISOString() : now,
                postType: raw?.postType ?? (pLocal as any)?.postType ?? existing?.postType,
                meta: raw?.meta ?? (pLocal as any)?.meta ?? existing?.meta,
                isPinned: raw?.isPinned ?? (pLocal as any)?.isPinned ?? existing?.isPinned,
                pinOrder: raw?.pinOrder ?? (pLocal as any)?.pinOrder ?? existing?.pinOrder,
              } as any;

              return { ...prev, posts };
            });

            // Keep SQL index in sync BEFORE setState so SQL-backed paging sees server-confirmed post.
            try {
              if (postId && postId !== id) {
                await deletePostCascadeAsync(id);
              }

              if (sid && postId) {
                await markSeenPostsAsync(sid, [postId]);
              }

              const row = (nextDb as any)?.posts?.[postId] ?? null;
              if (row) await upsertPostsAsync([row]);
            } catch {
              // ignore
            }

            setState({ isReady: true, db: nextDb as any });
          })().catch(() => {
            // ignore; keep optimistic post
          });

          return;
        }

        const next = await updateDb((prev) => {
          const existing = prev.posts[id];

          const insertedAt = (existing as any)?.insertedAt ?? (p as any).insertedAt ?? now;
          const createdAt = (p as any).createdAt ?? (existing as any)?.createdAt ?? now;

          const parentPostId = (p as any)?.parentPostId ? String((p as any).parentPostId) : "";

          const posts = {
            ...prev.posts,
            [id]: {
              ...(existing ?? {}),
              ...p,
              id,
              insertedAt,
              createdAt,
              updatedAt: now,
            },
          } as any;

          if (parentPostId && posts[parentPostId]) {
            const parent = posts[parentPostId];
            posts[parentPostId] = {
              ...parent,
              replyCount: Math.max(0, Number((parent as any).replyCount ?? 0) + 1),
              updatedAt: now,
            } as any;
          }

          return { ...prev, posts };
        });

        // Keep SQL index in sync BEFORE setState so SQL-backed paging sees the new/updated post.
        try {
          const row = (next as any)?.posts?.[id] ?? null;
          if (row) await upsertPostsAsync([row]);

          const parentPostId = (p as any)?.parentPostId ? String((p as any).parentPostId) : "";
          if (parentPostId) {
            const parentRow = (next as any)?.posts?.[parentPostId] ?? null;
            if (parentRow) await upsertPostsAsync([parentRow]);
          }
        } catch {
          // ignore
        }

        setState({ isReady: true, db: next as any });
      },

      deletePost: async (postId) => {
        const id = String(postId);
        let removedScenarioId = "";

        const token = String(auth.token ?? "").trim();
        const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
        if (token && baseUrl) {
          const res = await apiFetch({
            path: `/posts/${encodeURIComponent(id)}`,
            token,
            init: { method: "DELETE" },
          });

          if (!res.ok) {
            throw new Error((res.json as any)?.error ?? res.text ?? `Delete failed (HTTP ${res.status})`);
          }
        }

        const next = await updateDb((prev) => {
          if (!prev.posts[id]) return prev;

          removedScenarioId = String((prev.posts as any)?.[id]?.scenarioId ?? "");

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
          const removedPostScenarioId = removedScenarioId;

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

        // Keep SQL index in sync BEFORE setState so SQL-backed paging drops the post immediately.
        try {
          await deletePostCascadeAsync(id);
        } catch {
          // ignore
        }

        setState({ isReady: true, db: next as any });

        // If the user deleted from another screen (e.g. post detail), ensure the home feed refreshes
        // when they navigate back.
        if (removedScenarioId) markScenarioFeedRefreshNeeded(removedScenarioId);
      },

      // --- likes (table-backed) ---
      isPostLikedByProfile: likesApi.isPostLikedByProfile,
      listLikedPostIdsForProfile: likesApi.listLikedPostIdsForProfile,
      isPostLikedBySelectedProfile: likesApi.isPostLikedBySelectedProfile,
      toggleLikePost: likesApi.toggleLikePost,
      toggleLike: likesApi.toggleLike,
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
      getRepostEventForProfile: repostsApi.getRepostEventForProfile,
      isPostRepostedByProfileId: repostsApi.isPostRepostedByProfileId,
      isPostRepostedBySelectedProfile: repostsApi.isPostRepostedBySelectedProfile,
      toggleRepost: repostsApi.toggleRepost,

      // --- pins (campaign)
      listPinnedPostsForScenario: pinsApi.listPinnedPostsForScenario,
      togglePinPost: pinsApi.togglePinPost,
      reorderPinnedPostsForScenario: pinsApi.reorderPinnedPostsForScenario,

      // --- profile pins (one pinned post per profile)
      getPinnedPostIdForProfile: pinsApi.getPinnedPostIdForProfile,
      setPinnedPostForProfile: pinsApi.setPinnedPostForProfile,

      // --- scenarios
      getScenarioById: (id) => (db ? db.scenarios[String(id)] ?? null : null),
      listScenarios: () => (db ? Object.values(db.scenarios) : []),
      syncScenarios: async (opts) => {
        await syncScenariosFromBackend({ force: Boolean(opts?.force) });
      },

      upsertScenario: scenariosApi.upsertScenario,
      joinScenarioByInviteCode: scenariosApi.joinScenarioByInviteCode,
      adoptPublicProfile: scenariosApi.adoptPublicProfile,
      transferScenarioOwnership: scenariosApi.transferScenarioOwnership,
      transferProfilesToUser: scenariosApi.transferProfilesToUser,
      leaveScenario: scenariosApi.leaveScenario,
      deleteScenario: scenariosApi.deleteScenario,
      setScenarioMode: scenariosApi.setScenarioMode,

      // --- character sheets
      getCharacterSheetByProfileId: characterSheetsApi.getCharacterSheetByProfileId,
      upsertCharacterSheet: characterSheetsApi.upsertCharacterSheet,

      // GM helpers
      gmApplySheetUpdate: gmToolsApi.gmApplySheetUpdate,
      gmCommitSheetAndPostText: gmToolsApi.gmCommitSheetAndPostText,

      // --- import/export
      importScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        return await scenarioImportExportApi.importScenarioFromFile({
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
        });
      },

      exportScenarioToFile: async ({ scenarioId, includeProfiles, includePosts, includeSheets }) => {
        return await scenarioImportExportApi.exportScenarioToFile({
          scenarioId,
          includeProfiles,
          includePosts,
          includeSheets,
        });
      },

      previewImportScenarioFromFile: async ({ includeProfiles, includePosts, includeReposts, includeSheets }) => {
        return await scenarioImportExportApi.previewImportScenarioFromFile({
          includeProfiles,
          includePosts,
          includeReposts,
          includeSheets,
        });
      },

      // --- scenario settings
      getScenarioSettings: scenarioSettingsApi.getScenarioSettings,
      updateScenarioSettings: scenarioSettingsApi.updateScenarioSettings,

      getScenarioNotificationPrefs: async (scenarioId: string) => {
        return await scenarioNotificationPrefsApi.getScenarioNotificationPrefs(scenarioId);
      },

      updateScenarioNotificationPrefs: async (scenarioId: string, patch: any) => {
        return await scenarioNotificationPrefsApi.updateScenarioNotificationPrefs(scenarioId, patch);
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

        try {
          const items = listConversationsForScenarioSync(sid, pid);
          return items.map((c) => (map as any)?.[String((c as any).id ?? "")] ?? c);
        } catch {
          return [];
        }
      },

      listMessagesPage: pagingApi.listMessagesPage,

      upsertConversation: async (c: Conversation) => {
        await dmConversationsApi.upsertConversation(c);
      },

      updateConversationMeta: async ({ scenarioId, conversationId, title, avatarUrl }) => {
        await dmConversationsApi.updateConversationMeta({ scenarioId, conversationId, title, avatarUrl });
      },

      updateConversationParticipants: async ({ scenarioId, conversationId, participantProfileIds }) => {
        await dmConversationsApi.updateConversationParticipants({ scenarioId, conversationId, participantProfileIds });
      },

      sendMessage: async ({
        scenarioId,
        conversationId,
        senderProfileId,
        text,
        imageUris,
        kind,
        clientMessageId,
      }: {
        scenarioId: string;
        conversationId: string;
        senderProfileId: string;
        text: string;
        imageUris?: string[];
        kind?: string;
        clientMessageId?: string;
      }) => {
        return await dmMessagesApi.sendMessage({
          scenarioId,
          conversationId,
          senderProfileId,
          text,
          imageUris,
          kind,
          clientMessageId,
        });
      },

      // Send typing events over the open websocket for this scenario.
      sendTyping,

      updateMessage: async ({ scenarioId, messageId, text, senderProfileId }) => {
        await dmMessagesApi.updateMessage({ scenarioId, messageId, text, senderProfileId });
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
        await dmMessagesApi.deleteMessage({ scenarioId, messageId });
      },

      reorderMessagesInConversation: async ({ scenarioId, conversationId, orderedMessageIds }) => {
        await dmMessagesApi.reorderMessagesInConversation({ scenarioId, conversationId, orderedMessageIds });
      },

      // ===== DM helpers (for your “send as” UX) =====
      getConversationById: dmConversationsApi.getConversationById,
      listSendAsProfilesForScenario: dmConversationsApi.listSendAsProfilesForScenario,
      getOrCreateConversation: dmConversationsApi.getOrCreateConversation,
    };
  }, [db, currentUserId, auth.isReady, syncScenariosFromBackend]);

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

  const showBootSplash = !state.isReady || !auth.isReady;

  return <Ctx.Provider value={{ ...state, ...api }}>{showBootSplash ? <BootSplash /> : children}</Ctx.Provider>;
}

export function useAppData() {
  const v = React.useContext(Ctx);
  if (v) return v;

  // Defensive fallback: in rare cold-start / notification timing cases, a screen can
  // render before the provider tree is fully mounted. Avoid a hard crash and let the
  // app recover once the provider mounts.
  try {
    if (!(globalThis as any).__feedverse_warned_missing_appdata) {
      (globalThis as any).__feedverse_warned_missing_appdata = true;
      // eslint-disable-next-line no-console
      console.warn("useAppData called without AppDataProvider; returning fallback shim");
    }
  } catch {}

  const fallback: any = (globalThis as any).__feedverse_appdata_fallback ?? null;
  if (fallback) return fallback;

  const base = { isReady: false, db: null } as any;
  const proxy = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop as any];
      const key = String(prop);

      if (key.startsWith("list")) return () => [];
      if (key.startsWith("get")) return () => null;
      if (key.startsWith("has")) return () => false;
      if (key.startsWith("is")) return () => false;

      if (
        key.startsWith("sync") ||
        key.startsWith("send") ||
        key.startsWith("create") ||
        key.startsWith("delete") ||
        key.startsWith("update") ||
        key.startsWith("mark") ||
        key.startsWith("set")
      ) {
        return async () => {};
      }

      return undefined;
    },
  });

  try {
    (globalThis as any).__feedverse_appdata_fallback = proxy;
  } catch {}

  return proxy;
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