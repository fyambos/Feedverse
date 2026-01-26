// mobile/data/db/storage.ts
import { InteractionManager } from "react-native";
import * as SQLite from "expo-sqlite";
import { DB_KEY } from "./keys";
import type { Conversation, DbV5, Like, Message, Post, Profile, Repost, Scenario } from "./schema";

function normalizeHandleForIndex(handle: unknown): string {
  const raw = String(handle ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

const SQLITE_DB_NAME = "feedverse_v6.db";
const SQLITE_TABLE = "kv";

let sqliteInitPromise: Promise<void> | null = null;
let sqliteDbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getSqliteDb(): Promise<SQLite.SQLiteDatabase> {
  if (!sqliteDbPromise) {
    sqliteDbPromise = SQLite.openDatabaseAsync(SQLITE_DB_NAME);
  }
  return sqliteDbPromise;
}

async function ensureSqliteInit(): Promise<void> {
  if (sqliteInitPromise) return sqliteInitPromise;
  sqliteInitPromise = (async () => {
    const db = await getSqliteDb();

    // Pragmas: favor UI responsiveness.
    try {
      await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
    } catch {
      // ignore
    }

    // Avoid transient SQLITE_BUSY errors during short write bursts.
    try {
      await db.execAsync("PRAGMA busy_timeout = 5000;");
    } catch {
      // ignore
    }

    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS ${SQLITE_TABLE} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updatedAt INTEGER
      );`,
    );

    // Core app tables (source-of-truth candidates).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        cover TEXT,
        inviteCode TEXT,
        inviteCodeUpper TEXT,
        ownerUserId TEXT,
        description TEXT,
        mode TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        profileLimitMode TEXT,
        allowPlayersReorderMessages INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_scenarios_inviteCodeUpper ON scenarios (inviteCodeUpper);

      CREATE TABLE IF NOT EXISTS scenario_players (
        scenarioId TEXT NOT NULL,
        userId TEXT NOT NULL,
        PRIMARY KEY (scenarioId, userId)
      );
      CREATE INDEX IF NOT EXISTS idx_scenario_players_scenario ON scenario_players (scenarioId, userId);

      CREATE TABLE IF NOT EXISTS scenario_gms (
        scenarioId TEXT NOT NULL,
        userId TEXT NOT NULL,
        PRIMARY KEY (scenarioId, userId)
      );
      CREATE INDEX IF NOT EXISTS idx_scenario_gms_scenario ON scenario_gms (scenarioId, userId);

      CREATE TABLE IF NOT EXISTS scenario_pinned_posts (
        scenarioId TEXT NOT NULL,
        idx INTEGER NOT NULL,
        postId TEXT NOT NULL,
        PRIMARY KEY (scenarioId, idx)
      );
      CREATE INDEX IF NOT EXISTS idx_scenario_pins_scenario ON scenario_pinned_posts (scenarioId, idx);

      CREATE TABLE IF NOT EXISTS scenario_tags_local (
        scenarioId TEXT NOT NULL,
        tagId TEXT NOT NULL,
        idx INTEGER,
        key TEXT,
        name TEXT,
        color TEXT,
        PRIMARY KEY (scenarioId, tagId)
      );
      CREATE INDEX IF NOT EXISTS idx_scenario_tags_scenario ON scenario_tags_local (scenarioId, idx, tagId);

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY NOT NULL,
        scenarioId TEXT NOT NULL,
        ownerUserId TEXT,
        displayName TEXT,
        handle TEXT,
        handleNorm TEXT,
        avatarUrl TEXT,
        headerUrl TEXT,
        bio TEXT,
        isPublic INTEGER,
        joinedDate TEXT,
        location TEXT,
        link TEXT,
        followerCount INTEGER,
        followingCount INTEGER,
        createdAt TEXT,
        updatedAt TEXT,
        isPrivate INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_scenario ON profiles (scenarioId, id);

      CREATE INDEX IF NOT EXISTS idx_profiles_scenario_handleNorm ON profiles (scenarioId, handleNorm);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        scenarioId TEXT NOT NULL,
        title TEXT,
        avatarUrl TEXT,
        lastMessageAt TEXT,
        updatedAt TEXT,
        createdAt TEXT,
        lastMessageText TEXT,
        lastMessageKind TEXT,
        lastMessageSenderProfileId TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_scenario_last ON conversations (scenarioId, lastMessageAt DESC, id DESC);

      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversationId TEXT NOT NULL,
        idx INTEGER NOT NULL,
        profileId TEXT NOT NULL,
        PRIMARY KEY (conversationId, profileId)
      );
      CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants (conversationId, idx);

      CREATE INDEX IF NOT EXISTS idx_conv_participants_profile ON conversation_participants (profileId, conversationId);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        scenarioId TEXT NOT NULL,
        conversationId TEXT NOT NULL,
        senderProfileId TEXT,
        senderUserId TEXT,
        text TEXT,
        kind TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        editedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (scenarioId, conversationId, createdAt DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_asc ON messages (scenarioId, conversationId, createdAt ASC, id ASC);

      CREATE TABLE IF NOT EXISTS message_images (
        messageId TEXT NOT NULL,
        idx INTEGER NOT NULL,
        url TEXT NOT NULL,
        PRIMARY KEY (messageId, idx)
      );
      CREATE INDEX IF NOT EXISTS idx_message_images_msg ON message_images (messageId, idx);
    `);

        // Lightweight migration for existing installs.
        // (CREATE TABLE IF NOT EXISTS won't add new columns.)
        try {
          await db.execAsync("ALTER TABLE scenarios ADD COLUMN allowPlayersReorderMessages INTEGER;");
        } catch {
          // ignore (column may already exist)
        }

    // Best-effort: let SQLite update internal stats/plans.
    try {
      await db.execAsync("PRAGMA optimize;");
    } catch {
      // ignore
    }
  })();
  return sqliteInitPromise;
}

async function sqliteGet(key: string): Promise<string | null> {
  await ensureSqliteInit();
  const db = await getSqliteDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM ${SQLITE_TABLE} WHERE key = ? LIMIT 1;`, [key]);
  return row?.value ?? null;
}

async function sqliteSet(key: string, value: string): Promise<void> {
  await ensureSqliteInit();
  const db = await getSqliteDb();
  await db.runAsync(`INSERT OR REPLACE INTO ${SQLITE_TABLE} (key, value, updatedAt) VALUES (?, ?, ?);`, [key, value, Date.now()]);
}

type FeedTablesSnapshot = {
  posts: Record<string, Post>;
  likes: Record<string, Like>;
  reposts: Record<string, Repost>;
};

type CoreTablesSnapshot = {
  scenarios: Record<string, Scenario>;
  profiles: Record<string, Profile>;
  conversations: Record<string, Conversation>;
  messages: Record<string, Message>;
};

async function readFeedTablesSnapshot(): Promise<FeedTablesSnapshot> {
  await ensureSqliteInit();
  const db = await getSqliteDb();

  const out: FeedTablesSnapshot = { posts: {}, likes: {}, reposts: {} };

  try {
    // Prefer column-based read to avoid JSON parse.
    const postRows = await db.getAllAsync<any>(
      "SELECT id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson FROM posts;",
    );

    let imageRows: any[] = [];
    try {
      imageRows = await db.getAllAsync<any>("SELECT postId, idx, url FROM post_images ORDER BY postId ASC, idx ASC;");
    } catch {
      imageRows = [];
    }
    const imageMap = new Map<string, string[]>();
    for (const r of imageRows) {
      const postId = String((r as any)?.postId ?? "");
      const url = String((r as any)?.url ?? "");
      if (!postId || !url) continue;
      const arr = imageMap.get(postId) ?? [];
      arr.push(url);
      imageMap.set(postId, arr);
    }

    for (const r of postRows) {
      const id = String((r as any)?.id ?? "").trim();
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      const authorProfileId = String((r as any)?.authorProfileId ?? "").trim();
      if (!id || !scenarioId || !authorProfileId) continue;

      let meta: any = undefined;
      if ((r as any)?.metaJson != null && String((r as any).metaJson).length > 0) {
        try {
          meta = JSON.parse(String((r as any).metaJson));
        } catch {
          meta = undefined;
        }
      }

      const p: Post = {
        id,
        scenarioId,
        authorProfileId,
        text: String((r as any)?.text ?? ""),
        createdAt: String((r as any)?.createdAt ?? ""),
        insertedAt: String((r as any)?.insertedAt ?? ""),
        ...(String((r as any)?.authorUserId ?? "") ? { authorUserId: String((r as any).authorUserId) } : {}),
        ...(String((r as any)?.updatedAt ?? "") ? { updatedAt: String((r as any).updatedAt) } : {}),
        ...(String((r as any)?.parentPostId ?? "") ? { parentPostId: String((r as any).parentPostId) } : {}),
        ...(String((r as any)?.quotedPostId ?? "") ? { quotedPostId: String((r as any).quotedPostId) } : {}),
        ...(String((r as any)?.postType ?? "") ? { postType: String((r as any).postType) as any } : {}),
        ...((r as any)?.replyCount == null ? {} : { replyCount: Number((r as any).replyCount) }),
        ...((r as any)?.repostCount == null ? {} : { repostCount: Number((r as any).repostCount) }),
        ...((r as any)?.likeCount == null ? {} : { likeCount: Number((r as any).likeCount) }),
        ...((r as any)?.isPinned == null ? {} : { isPinned: Boolean(Number((r as any).isPinned)) }),
        ...((r as any)?.pinOrder == null ? {} : { pinOrder: Number((r as any).pinOrder) }),
        ...(meta !== undefined ? { meta } : {}),
      };

      const urls = imageMap.get(id);
      if (urls && urls.length > 0) {
        (p as any).imageUrls = urls;
      }

      out.posts[id] = p;
    }
  } catch {
    // Legacy fallback: old schema stored full post JSON.
    try {
      const postRows = await db.getAllAsync<{ id: string; json: string }>("SELECT id, json FROM posts;");
      for (const r of postRows) {
        const id = String((r as any)?.id ?? "").trim();
        if (!id) continue;
        try {
          out.posts[id] = JSON.parse(String((r as any).json)) as Post;
        } catch {
          // ignore
        }
      }
    } catch {
      // tolerate missing table
    }
  }

  try {
    const likeRows = await db.getAllAsync<{
      scenarioId: string;
      profileId: string;
      postId: string;
      createdAt: string;
      id: string | null;
    }>("SELECT scenarioId, profileId, postId, createdAt, id FROM likes;");

    for (const r of likeRows) {
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      const profileId = String((r as any)?.profileId ?? "").trim();
      const postId = String((r as any)?.postId ?? "").trim();
      if (!scenarioId || !profileId || !postId) continue;
      const key = `${scenarioId}|${profileId}|${postId}`;
      out.likes[key] = {
        id: String((r as any)?.id ?? key),
        scenarioId,
        profileId,
        postId,
        createdAt: String((r as any)?.createdAt ?? ""),
      } as Like;
    }
  } catch {
    // tolerate missing table
  }

  try {
    const repostRows = await db.getAllAsync<{
      scenarioId: string;
      profileId: string;
      postId: string;
      createdAt: string;
      id: string | null;
    }>("SELECT scenarioId, profileId, postId, createdAt, id FROM reposts;");

    for (const r of repostRows) {
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      const profileId = String((r as any)?.profileId ?? "").trim();
      const postId = String((r as any)?.postId ?? "").trim();
      if (!scenarioId || !profileId || !postId) continue;
      // Keying matches app convention: `${profileId}|${postId}`.
      // (Post ids are expected to be globally unique; scenarioId is stored on the value.)
      const key = `${profileId}|${postId}`;
      out.reposts[key] = {
        id: String((r as any)?.id ?? key),
        scenarioId,
        profileId,
        postId,
        createdAt: String((r as any)?.createdAt ?? ""),
      } as Repost;
    }
  } catch {
    // tolerate missing table
  }

  return out;
}

async function readCoreTablesSnapshot(): Promise<CoreTablesSnapshot> {
  await ensureSqliteInit();
  const db = await getSqliteDb();

  const out: CoreTablesSnapshot = { scenarios: {}, profiles: {}, conversations: {}, messages: {} };

  // Scenarios + joins
  try {
    const rows = await db.getAllAsync<any>(
      "SELECT id, name, cover, inviteCode, ownerUserId, description, mode, createdAt, updatedAt, profileLimitMode, allowPlayersReorderMessages FROM scenarios;",
    );
    const players = await db.getAllAsync<any>("SELECT scenarioId, userId FROM scenario_players ORDER BY scenarioId ASC;");
    const gms = await db.getAllAsync<any>("SELECT scenarioId, userId FROM scenario_gms ORDER BY scenarioId ASC;");
    const pins = await db.getAllAsync<any>("SELECT scenarioId, idx, postId FROM scenario_pinned_posts ORDER BY scenarioId ASC, idx ASC;");
    const tags = await db.getAllAsync<any>("SELECT scenarioId, tagId, idx, key, name, color FROM scenario_tags_local ORDER BY scenarioId ASC, idx ASC;");

    const playerMap = new Map<string, string[]>();
    for (const r of players) {
      const sid = String((r as any).scenarioId ?? "");
      const uid = String((r as any).userId ?? "");
      if (!sid || !uid) continue;
      const arr = playerMap.get(sid) ?? [];
      arr.push(uid);
      playerMap.set(sid, arr);
    }

    const gmMap = new Map<string, string[]>();
    for (const r of gms) {
      const sid = String((r as any).scenarioId ?? "");
      const uid = String((r as any).userId ?? "");
      if (!sid || !uid) continue;
      const arr = gmMap.get(sid) ?? [];
      arr.push(uid);
      gmMap.set(sid, arr);
    }

    const pinMap = new Map<string, string[]>();
    for (const r of pins) {
      const sid = String((r as any).scenarioId ?? "");
      const pid = String((r as any).postId ?? "");
      if (!sid || !pid) continue;
      const arr = pinMap.get(sid) ?? [];
      arr.push(pid);
      pinMap.set(sid, arr);
    }

    const tagMap = new Map<string, any[]>();
    for (const r of tags) {
      const sid = String((r as any).scenarioId ?? "");
      if (!sid) continue;
      const arr = tagMap.get(sid) ?? [];
      arr.push({
        id: String((r as any).tagId ?? ""),
        key: String((r as any).key ?? ""),
        name: String((r as any).name ?? ""),
        color: String((r as any).color ?? ""),
      });
      tagMap.set(sid, arr);
    }

    for (const r of rows) {
      const id = String((r as any)?.id ?? "").trim();
      if (!id) continue;
      const mode = String((r as any)?.mode ?? "story") as any;
      const scenario: Scenario = {
        id,
        name: String((r as any)?.name ?? ""),
        cover: String((r as any)?.cover ?? ""),
        playerIds: playerMap.get(id) ?? [],
        createdAt: String((r as any)?.createdAt ?? ""),
        updatedAt: String((r as any)?.updatedAt ?? "") || undefined,
        inviteCode: String((r as any)?.inviteCode ?? ""),
        ownerUserId: String((r as any)?.ownerUserId ?? ""),
        allowPlayersReorderMessages:
          (r as any)?.allowPlayersReorderMessages == null ? true : Boolean(Number((r as any).allowPlayersReorderMessages)),
        description: String((r as any)?.description ?? "") || undefined,
        mode,
        ...(gmMap.get(id)?.length ? { gmUserIds: gmMap.get(id) } : {}),
        ...(tagMap.get(id)?.length ? { tags: tagMap.get(id) as any } : {}),
        ...(pinMap.get(id)?.length || (r as any)?.profileLimitMode
          ? {
              settings: {
                ...(String((r as any)?.profileLimitMode ?? "")
                  ? { profileLimitMode: String((r as any).profileLimitMode) as any }
                  : {}),
                ...(pinMap.get(id)?.length ? { pinnedPostIds: pinMap.get(id) } : {}),
              },
            }
          : {}),
      };
      out.scenarios[id] = scenario;
    }
  } catch {
    // ignore
  }

  // Profiles
  try {
    const rows = await db.getAllAsync<any>(
      "SELECT id, scenarioId, ownerUserId, displayName, handle, avatarUrl, headerUrl, bio, isPublic, joinedDate, location, link, followerCount, followingCount, createdAt, updatedAt, isPrivate FROM profiles;",
    );
    for (const r of rows) {
      const id = String((r as any)?.id ?? "").trim();
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      const ownerUserId = String((r as any)?.ownerUserId ?? "").trim();
      if (!id || !scenarioId || !ownerUserId) continue;
      out.profiles[id] = {
        id,
        scenarioId,
        ownerUserId,
        displayName: String((r as any)?.displayName ?? ""),
        handle: String((r as any)?.handle ?? ""),
        avatarUrl: String((r as any)?.avatarUrl ?? ""),
        headerUrl: String((r as any)?.headerUrl ?? "") || undefined,
        bio: String((r as any)?.bio ?? "") || undefined,
        isPublic: (r as any)?.isPublic == null ? undefined : Boolean(Number((r as any).isPublic)),
        joinedDate: String((r as any)?.joinedDate ?? "") || undefined,
        location: String((r as any)?.location ?? "") || undefined,
        link: String((r as any)?.link ?? "") || undefined,
        followerCount: (r as any)?.followerCount == null ? undefined : Number((r as any).followerCount),
        followingCount: (r as any)?.followingCount == null ? undefined : Number((r as any).followingCount),
        createdAt: String((r as any)?.createdAt ?? ""),
        updatedAt: String((r as any)?.updatedAt ?? "") || undefined,
        isPrivate: (r as any)?.isPrivate == null ? undefined : Boolean(Number((r as any).isPrivate)),
      } as Profile;
    }
  } catch {
    // ignore
  }

  // Conversations + participants
  try {
    const convRows = await db.getAllAsync<any>(
      "SELECT id, scenarioId, title, avatarUrl, createdAt, updatedAt, lastMessageAt, lastMessageText, lastMessageKind, lastMessageSenderProfileId FROM conversations;",
    );
    const partRows = await db.getAllAsync<any>(
      "SELECT conversationId, idx, profileId FROM conversation_participants ORDER BY conversationId ASC, idx ASC;",
    );
    const partMap = new Map<string, string[]>();
    for (const r of partRows) {
      const cid = String((r as any).conversationId ?? "");
      const pid = String((r as any).profileId ?? "");
      if (!cid || !pid) continue;
      const arr = partMap.get(cid) ?? [];
      arr.push(pid);
      partMap.set(cid, arr);
    }
    for (const r of convRows) {
      const id = String((r as any)?.id ?? "").trim();
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      if (!id || !scenarioId) continue;
      out.conversations[id] = {
        id,
        scenarioId,
        participantProfileIds: partMap.get(id) ?? [],
        title: String((r as any)?.title ?? "") || undefined,
        avatarUrl: String((r as any)?.avatarUrl ?? "") || undefined,
        createdAt: String((r as any)?.createdAt ?? ""),
        updatedAt: String((r as any)?.updatedAt ?? "") || undefined,
        lastMessageAt: String((r as any)?.lastMessageAt ?? "") || undefined,
        lastMessageText: String((r as any)?.lastMessageText ?? "") || undefined,
        lastMessageKind: String((r as any)?.lastMessageKind ?? "") || undefined,
        lastMessageSenderProfileId: String((r as any)?.lastMessageSenderProfileId ?? "") || undefined,
      } as Conversation;
    }
  } catch {
    // ignore
  }

  // Messages + images
  try {
    const msgRows = await db.getAllAsync<any>(
      "SELECT id, scenarioId, conversationId, senderProfileId, senderUserId, text, kind, createdAt, updatedAt, editedAt FROM messages;",
    );
    const imgRows = await db.getAllAsync<any>(
      "SELECT messageId, idx, url FROM message_images ORDER BY messageId ASC, idx ASC;",
    );
    const imgMap = new Map<string, string[]>();
    for (const r of imgRows) {
      const mid = String((r as any).messageId ?? "");
      const url = String((r as any).url ?? "");
      if (!mid || !url) continue;
      const arr = imgMap.get(mid) ?? [];
      arr.push(url);
      imgMap.set(mid, arr);
    }
    for (const r of msgRows) {
      const id = String((r as any)?.id ?? "").trim();
      const scenarioId = String((r as any)?.scenarioId ?? "").trim();
      const conversationId = String((r as any)?.conversationId ?? "").trim();
      const senderProfileId = String((r as any)?.senderProfileId ?? "").trim();
      const createdAt = String((r as any)?.createdAt ?? "").trim();
      if (!id || !scenarioId || !conversationId || !senderProfileId || !createdAt) continue;
      out.messages[id] = {
        id,
        scenarioId,
        conversationId,
        senderProfileId,
        senderUserId: String((r as any)?.senderUserId ?? "") || undefined,
        text: String((r as any)?.text ?? ""),
        kind: String((r as any)?.kind ?? "") || undefined,
        imageUrls: imgMap.get(id),
        createdAt,
        updatedAt: String((r as any)?.updatedAt ?? "") || undefined,
        editedAt: String((r as any)?.editedAt ?? "") || undefined,
      } as Message;
    }
  } catch {
    // ignore
  }

  return out;
}

const MAX_MESSAGES_PER_CONVERSATION = 250;
const MAX_MESSAGES_TOTAL = 4000;

function compareNewestFirst(a: any, b: any): number {
  const ac = String(a?.createdAt ?? "");
  const bc = String(b?.createdAt ?? "");
  if (ac !== bc) return bc < ac ? -1 : 1;
  const ai = String(a?.id ?? "");
  const bi = String(b?.id ?? "");
  if (ai === bi) return 0;
  return bi < ai ? -1 : 1;
}

function pruneMessagesForLocalCache(messages: Message[]): Message[] {
  if (!messages.length) return messages;

  // Keep a bounded, recent cache per conversation, then cap total.
  const byConv = new Map<string, Message[]>();
  for (const m of messages) {
    const conversationId = String((m as any)?.conversationId ?? "").trim();
    if (!conversationId) continue;
    const arr = byConv.get(conversationId) ?? [];
    arr.push(m);
    byConv.set(conversationId, arr);
  }

  const out: Message[] = [];
  for (const arr of byConv.values()) {
    arr.sort(compareNewestFirst);
    out.push(...arr.slice(0, MAX_MESSAGES_PER_CONVERSATION));
  }

  out.sort(compareNewestFirst);
  return out.slice(0, MAX_MESSAGES_TOTAL);
}

async function persistCoreTablesFromDbSnapshot(snapshot: DbV5): Promise<void> {
  await ensureSqliteInit();
  const db = await getSqliteDb();

  const scenarios = Object.values((snapshot as any).scenarios ?? {}) as Scenario[];
  const profiles = Object.values((snapshot as any).profiles ?? {}) as Profile[];
  const conversations = Object.values((snapshot as any).conversations ?? {}) as Conversation[];
  const messages = pruneMessagesForLocalCache(Object.values((snapshot as any).messages ?? {}) as Message[]);

  await db.withExclusiveTransactionAsync(async (txn) => {
    // Full replace keeps tables in sync with the snapshot (including deletions).
    await txn.execAsync(
      "DELETE FROM scenarios; DELETE FROM scenario_players; DELETE FROM scenario_gms; DELETE FROM scenario_pinned_posts; DELETE FROM scenario_tags_local; DELETE FROM profiles; DELETE FROM conversations; DELETE FROM conversation_participants; DELETE FROM messages; DELETE FROM message_images;",
    );

    for (const s of scenarios) {
      const id = String((s as any)?.id ?? "").trim();
      if (!id) continue;
      const inviteCode = String((s as any)?.inviteCode ?? "");
      await txn.runAsync(
        "INSERT OR REPLACE INTO scenarios (id, name, cover, inviteCode, inviteCodeUpper, ownerUserId, description, mode, createdAt, updatedAt, profileLimitMode, allowPlayersReorderMessages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          id,
          String((s as any)?.name ?? ""),
          String((s as any)?.cover ?? ""),
          inviteCode,
          inviteCode.trim() ? inviteCode.trim().toUpperCase() : null,
          String((s as any)?.ownerUserId ?? ""),
          String((s as any)?.description ?? "") || null,
          String((s as any)?.mode ?? "story"),
          String((s as any)?.createdAt ?? ""),
          String((s as any)?.updatedAt ?? "") || null,
          String((s as any)?.settings?.profileLimitMode ?? "") || null,
          (s as any)?.allowPlayersReorderMessages ? 1 : 0,
        ],
      );

    const playerIds = Array.isArray((s as any)?.playerIds) ? ((s as any).playerIds as any[]) : [];
    for (const uidRaw of playerIds) {
      const uid = String(uidRaw ?? "").trim();
      if (!uid) continue;
      await txn.runAsync("INSERT OR IGNORE INTO scenario_players (scenarioId, userId) VALUES (?, ?);", [id, uid]);
    }

    const gmIds = Array.isArray((s as any)?.gmUserIds) ? ((s as any).gmUserIds as any[]) : [];
    for (const uidRaw of gmIds) {
      const uid = String(uidRaw ?? "").trim();
      if (!uid) continue;
      await txn.runAsync("INSERT OR IGNORE INTO scenario_gms (scenarioId, userId) VALUES (?, ?);", [id, uid]);
    }

    const pinned = Array.isArray((s as any)?.settings?.pinnedPostIds) ? ((s as any).settings.pinnedPostIds as any[]) : [];
    for (let idx = 0; idx < pinned.length; idx++) {
      const postId = String(pinned[idx] ?? "").trim();
      if (!postId) continue;
      await txn.runAsync("INSERT OR REPLACE INTO scenario_pinned_posts (scenarioId, idx, postId) VALUES (?, ?, ?);", [id, idx, postId]);
    }

    const tags = Array.isArray((s as any)?.tags) ? ((s as any).tags as any[]) : [];
    for (let idx = 0; idx < tags.length; idx++) {
      const t = tags[idx];
      const tagId = String((t as any)?.id ?? idx).trim();
      if (!tagId) continue;
      await txn.runAsync(
        "INSERT OR REPLACE INTO scenario_tags_local (scenarioId, tagId, idx, key, name, color) VALUES (?, ?, ?, ?, ?, ?);",
        [
          id,
          tagId,
          idx,
          String((t as any)?.key ?? "") || null,
          String((t as any)?.name ?? "") || null,
          String((t as any)?.color ?? "") || null,
        ],
      );
    }
    }

    for (const p of profiles) {
      const id = String((p as any)?.id ?? "").trim();
      const scenarioId = String((p as any)?.scenarioId ?? "").trim();
      if (!id || !scenarioId) continue;
    const handle = String((p as any)?.handle ?? "");
    await txn.runAsync(
      "INSERT OR REPLACE INTO profiles (id, scenarioId, ownerUserId, displayName, handle, handleNorm, avatarUrl, headerUrl, bio, isPublic, joinedDate, location, link, followerCount, followingCount, createdAt, updatedAt, isPrivate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        id,
        scenarioId,
        String((p as any)?.ownerUserId ?? ""),
        String((p as any)?.displayName ?? ""),
        handle,
        normalizeHandleForIndex(handle) || null,
        String((p as any)?.avatarUrl ?? ""),
        String((p as any)?.headerUrl ?? "") || null,
        String((p as any)?.bio ?? "") || null,
        (p as any)?.isPublic == null ? null : (p as any).isPublic ? 1 : 0,
        String((p as any)?.joinedDate ?? "") || null,
        String((p as any)?.location ?? "") || null,
        String((p as any)?.link ?? "") || null,
        (p as any)?.followerCount ?? null,
        (p as any)?.followingCount ?? null,
        String((p as any)?.createdAt ?? ""),
        String((p as any)?.updatedAt ?? "") || null,
        (p as any)?.isPrivate == null ? null : (p as any).isPrivate ? 1 : 0,
      ],
    );
    }

    for (const c of conversations) {
      const id = String((c as any)?.id ?? "").trim();
      const scenarioId = String((c as any)?.scenarioId ?? "").trim();
      if (!id || !scenarioId) continue;
    await txn.runAsync(
      "INSERT OR REPLACE INTO conversations (id, scenarioId, title, avatarUrl, createdAt, updatedAt, lastMessageAt, lastMessageText, lastMessageKind, lastMessageSenderProfileId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        id,
        scenarioId,
        String((c as any)?.title ?? "") || null,
        String((c as any)?.avatarUrl ?? "") || null,
        String((c as any)?.createdAt ?? ""),
        String((c as any)?.updatedAt ?? "") || null,
        String((c as any)?.lastMessageAt ?? "") || null,
        String((c as any)?.lastMessageText ?? "") || null,
        String((c as any)?.lastMessageKind ?? "") || null,
        String((c as any)?.lastMessageSenderProfileId ?? "") || null,
      ],
    );

    const parts = Array.isArray((c as any)?.participantProfileIds) ? ((c as any).participantProfileIds as any[]) : [];
    for (let idx = 0; idx < parts.length; idx++) {
      const pid = String(parts[idx] ?? "").trim();
      if (!pid) continue;
      await txn.runAsync("INSERT OR REPLACE INTO conversation_participants (conversationId, idx, profileId) VALUES (?, ?, ?);", [id, idx, pid]);
    }
    }

    for (const m of messages) {
      const id = String((m as any)?.id ?? "").trim();
      const scenarioId = String((m as any)?.scenarioId ?? "").trim();
      const conversationId = String((m as any)?.conversationId ?? "").trim();
      const createdAt = String((m as any)?.createdAt ?? "").trim();
      if (!id || !scenarioId || !conversationId || !createdAt) continue;
    await txn.runAsync(
      "INSERT OR REPLACE INTO messages (id, scenarioId, conversationId, senderProfileId, senderUserId, text, kind, createdAt, updatedAt, editedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        id,
        scenarioId,
        conversationId,
        String((m as any)?.senderProfileId ?? ""),
        String((m as any)?.senderUserId ?? "") || null,
        String((m as any)?.text ?? ""),
        String((m as any)?.kind ?? "") || null,
        createdAt,
        String((m as any)?.updatedAt ?? "") || null,
        String((m as any)?.editedAt ?? "") || null,
      ],
    );

    const urls = Array.isArray((m as any)?.imageUrls) ? ((m as any).imageUrls as any[]) : [];
    for (let idx = 0; idx < urls.length; idx++) {
      const url = String(urls[idx] ?? "").trim();
      if (!url) continue;
      await txn.runAsync("INSERT OR REPLACE INTO message_images (messageId, idx, url) VALUES (?, ?, ?);", [id, idx, url]);
    }
    }
  });
}

function stripFeedCollectionsForKv(db: DbV5): DbV5 {
  return {
    ...(db as any),
    posts: {},
    reposts: {},
    likes: {},
    scenarios: {},
    profiles: {},
    conversations: {},
    messages: {},
  } as DbV5;
}

function makeEmptyDbV5(): DbV5 {
  const now = new Date().toISOString();
  return {
    version: 5,
    seededAt: now,
    users: {},
    scenarios: {},
    profiles: {},
    posts: {},
    reposts: {},
    likes: {},
    selectedProfileByScenario: {},
    tags: {},
    sheets: {},
    profilePins: {},
    conversations: {},
    messages: {},
    selectedConversationByScenario: {},
  } as DbV5;
}

let writeChain: Promise<void> = Promise.resolve();
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const run = writeChain.then(op, op);
  // keep chain alive even if op fails
  writeChain = run.then(() => void 0, () => void 0);
  return run;
}

let cachedDb: DbV5 | null = null;
let cacheLoaded = false;

let flushTimer: any = null;
let flushInFlight: Promise<void> | null = null;

function isSqliteLockedError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
  return msg.includes("database is locked") || msg.includes("sqlite_busy") || msg.includes("sqlite_locked");
}

async function withSqliteRetry<T>(op: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  // small bounded backoff: 50ms, 120ms, 250ms
  const delays = [50, 120, 250];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await op();
    } catch (e) {
      if (!isSqliteLockedError(e) || attempt >= retries) throw e;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt++;
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
}

function scheduleFlush() {
  if (!cacheLoaded || !cachedDb) return;

  if (flushTimer) clearTimeout(flushTimer);

  // Debounce so bursts of edits only persist once.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const snapshot = cachedDb;
    if (!snapshot) return;

    flushInFlight = enqueueWrite(async () => {
      // Avoid blocking animations / user interaction.
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      // Persist core collections into real tables first, then write the stripped KV snapshot.
      // Retry on transient SQLITE_BUSY/locked errors.
      await withSqliteRetry(async () => {
        await persistCoreTablesFromDbSnapshot(snapshot);
        await sqliteSet(DB_KEY, JSON.stringify(stripFeedCollectionsForKv(snapshot)));
      });
    })
      // Never surface async flush errors as unhandled promise rejections.
      .catch(() => {})
      .finally(() => {
      flushInFlight = null;
    });
  }, 800);
}

export async function readDb(): Promise<DbV5 | null> {
  if (cacheLoaded) return cachedDb;

  const raw = await sqliteGet(DB_KEY);

  cacheLoaded = true;

  if (!raw) {
    cachedDb = null;
    return null;
  }

  try {
    const base = JSON.parse(raw) as DbV5;

    const feed = await readFeedTablesSnapshot();
    const core = await readCoreTablesSnapshot();

    const basePosts = ((base as any).posts ?? {}) as Record<string, Post>;
    const baseReposts = ((base as any).reposts ?? {}) as Record<string, Repost>;
    const baseLikes = (((base as any).likes ?? {}) as any) as Record<string, Like>;
    const baseScenarios = ((base as any).scenarios ?? {}) as Record<string, Scenario>;
    const baseProfiles = ((base as any).profiles ?? {}) as Record<string, Profile>;
    const baseConversations = (((base as any).conversations ?? {}) as any) as Record<string, Conversation>;
    const baseMessages = (((base as any).messages ?? {}) as any) as Record<string, Message>;

    const coreIsEmpty =
      Object.keys(core.scenarios).length === 0 &&
      Object.keys(core.profiles).length === 0 &&
      Object.keys(core.conversations).length === 0 &&
      Object.keys(core.messages).length === 0;

    const baseHasCoreData =
      Object.keys(baseScenarios).length > 0 ||
      Object.keys(baseProfiles).length > 0 ||
      Object.keys(baseConversations).length > 0 ||
      Object.keys(baseMessages).length > 0;

    const corePreferred = coreIsEmpty && baseHasCoreData ? (await (async () => {
      try {
        await persistCoreTablesFromDbSnapshot(base);
      } catch {
        // ignore bootstrap failures
      }
      return await readCoreTablesSnapshot();
    })()) : core;

    cachedDb = {
      ...(base as any),
      posts: Object.keys(feed.posts).length > 0 ? (feed.posts as any) : basePosts,
      reposts: Object.keys(feed.reposts).length > 0 ? (feed.reposts as any) : baseReposts,
      likes: Object.keys(feed.likes).length > 0 ? (feed.likes as any) : (baseLikes as any),
      scenarios: Object.keys(corePreferred.scenarios).length > 0 ? (corePreferred.scenarios as any) : baseScenarios,
      profiles: Object.keys(corePreferred.profiles).length > 0 ? (corePreferred.profiles as any) : baseProfiles,
      conversations: Object.keys(corePreferred.conversations).length > 0 ? (corePreferred.conversations as any) : (baseConversations as any),
      messages: Object.keys(corePreferred.messages).length > 0 ? (corePreferred.messages as any) : (baseMessages as any),
    } as DbV5;
    return cachedDb;
  } catch {
    cachedDb = null;
    return null;
  }
}

export async function writeDb(db: DbV5): Promise<void> {
  cachedDb = db;
  cacheLoaded = true;
  scheduleFlush();

  // Keep behavior similar for callers that await writes.
  if (flushInFlight) await flushInFlight;
}

export async function updateDb(fn: (prev: DbV5) => DbV5): Promise<DbV5> {
  // Ensure we have a cache before applying updates.
  if (!cacheLoaded) {
    await readDb();
  }

  // After a DB_KEY bump (or first install), kv may be empty.
  // Treat local DB as a cache and initialize an empty baseline so callers can proceed.
  let prev = cachedDb;
  if (!prev) {
    prev = makeEmptyDbV5();
    cachedDb = prev;
    cacheLoaded = true;
  }

  const next = fn(prev);
  cachedDb = next;
  cacheLoaded = true;

  scheduleFlush();

  // Notify subscribers synchronously so callers (e.g. auth) that update the DB
  // cause UI providers to refresh their state.
  try {
    for (const s of dbChangeSubscribers) {
      try {
        s(next);
      } catch {}
    }
  } catch {}

  // Return immediately; persistence is deferred.
  return next;
}

type DbChangeListener = (db: DbV5) => void;
const dbChangeSubscribers = new Set<DbChangeListener>();

export function subscribeDbChanges(fn: DbChangeListener) {
  dbChangeSubscribers.add(fn);
  return () => dbChangeSubscribers.delete(fn);
}