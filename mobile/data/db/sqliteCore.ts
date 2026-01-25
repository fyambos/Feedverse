import * as SQLite from "expo-sqlite";

import type { Conversation, Message, Profile } from "./schema";

const SQLITE_DB_NAME = "feedverse_v6.db";

let dbSync: SQLite.SQLiteDatabase | null = null;
let schemaInitSync = false;

function getDbSync(): SQLite.SQLiteDatabase {
  if (!dbSync) dbSync = SQLite.openDatabaseSync(SQLITE_DB_NAME);
  return dbSync;
}

function normalizeHandleForIndex(handle: unknown): string {
  const raw = String(handle ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

function ensureSchemaSync(): void {
  if (schemaInitSync) return;
  const db = getDbSync();

  try {
    db.execSync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
  } catch {
    // ignore
  }

  // Minimal schema for sync queries (safe if already exists).
  db.execSync(`
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
      profileLimitMode TEXT
    );

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

    CREATE INDEX IF NOT EXISTS idx_messages_conv_created_asc ON messages (scenarioId, conversationId, createdAt ASC, id ASC);

    CREATE TABLE IF NOT EXISTS message_images (
      messageId TEXT NOT NULL,
      idx INTEGER NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (messageId, idx)
    );
    CREATE INDEX IF NOT EXISTS idx_message_images_msg ON message_images (messageId, idx);

    CREATE INDEX IF NOT EXISTS idx_scenarios_inviteCodeUpper ON scenarios (inviteCodeUpper);
    CREATE INDEX IF NOT EXISTS idx_profiles_scenario_handleNorm ON profiles (scenarioId, handleNorm);
  `);

  schemaInitSync = true;
}

export function findScenarioIdByInviteCodeSync(inviteCode: string): string | null {
  ensureSchemaSync();
  const code = String(inviteCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const db = getDbSync();
  try {
    const row = db.getFirstSync<{ id: string }>(
      "SELECT id FROM scenarios WHERE inviteCodeUpper = ? LIMIT 1;",
      [code],
    );
    return row?.id ? String(row.id) : null;
  } catch {
    return null;
  }
}

export function getProfileByHandleSync(scenarioId: string, handle: string): Profile | null {
  ensureSchemaSync();

  const sid = String(scenarioId ?? "").trim();
  const needle = normalizeHandleForIndex(handle);
  if (!sid || !needle) return null;

  const db = getDbSync();

  try {
    const row = db.getFirstSync<any>(
      "SELECT id, scenarioId, ownerUserId, displayName, handle, avatarUrl, headerUrl, bio, isPublic, joinedDate, location, link, followerCount, followingCount, createdAt, updatedAt, isPrivate FROM profiles WHERE scenarioId = ? AND handleNorm = ? LIMIT 1;",
      [sid, needle],
    );

    if (!row?.id) return null;

    return {
      id: String(row.id),
      scenarioId: String(row.scenarioId),
      ownerUserId: String(row.ownerUserId ?? ""),
      displayName: String(row.displayName ?? ""),
      handle: String(row.handle ?? ""),
      avatarUrl: String(row.avatarUrl ?? ""),
      headerUrl: String(row.headerUrl ?? "") || undefined,
      bio: String(row.bio ?? "") || undefined,
      isPublic: row.isPublic == null ? undefined : Boolean(Number(row.isPublic)),
      joinedDate: String(row.joinedDate ?? "") || undefined,
      location: String(row.location ?? "") || undefined,
      link: String(row.link ?? "") || undefined,
      followerCount: row.followerCount == null ? undefined : Number(row.followerCount),
      followingCount: row.followingCount == null ? undefined : Number(row.followingCount),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? "") || undefined,
      isPrivate: row.isPrivate == null ? undefined : Boolean(Number(row.isPrivate)),
    } as Profile;
  } catch {
    return null;
  }
}

export function listConversationsForScenarioSync(scenarioId: string, profileId: string): Conversation[] {
  ensureSchemaSync();

  const sid = String(scenarioId ?? "").trim();
  const pid = String(profileId ?? "").trim();
  if (!sid || !pid) return [];

  const db = getDbSync();

  try {
    const rows = db.getAllSync<any>(
      `
      SELECT c.id, c.scenarioId, c.title, c.avatarUrl, c.createdAt, c.updatedAt, c.lastMessageAt, c.lastMessageText, c.lastMessageKind, c.lastMessageSenderProfileId
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversationId = c.id
      WHERE c.scenarioId = ? AND cp.profileId = ?
      GROUP BY c.id
      ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC;
      `,
      [sid, pid],
    );

    const convIds = (rows as any[]).map((r) => String(r.id)).filter(Boolean);
    if (convIds.length === 0) return [];

    const placeholders = convIds.map(() => "?").join(",");
    const partRows = db.getAllSync<any>(
      `SELECT conversationId, idx, profileId FROM conversation_participants WHERE conversationId IN (${placeholders}) ORDER BY conversationId ASC, idx ASC;`,
      convIds,
    );

    const partMap = new Map<string, string[]>();
    for (const r of partRows as any[]) {
      const cid = String(r.conversationId ?? "");
      const p = String(r.profileId ?? "");
      if (!cid || !p) continue;
      const arr = partMap.get(cid) ?? [];
      arr.push(p);
      partMap.set(cid, arr);
    }

    return (rows as any[]).map(
      (r) =>
        ({
          id: String(r.id),
          scenarioId: String(r.scenarioId),
          participantProfileIds: partMap.get(String(r.id)) ?? [],
          title: String(r.title ?? "") || undefined,
          avatarUrl: String(r.avatarUrl ?? "") || undefined,
          createdAt: String(r.createdAt ?? ""),
          updatedAt: String(r.updatedAt ?? "") || undefined,
          lastMessageAt: String(r.lastMessageAt ?? "") || undefined,
          lastMessageText: String(r.lastMessageText ?? "") || undefined,
          lastMessageKind: String(r.lastMessageKind ?? "") || undefined,
          lastMessageSenderProfileId: String(r.lastMessageSenderProfileId ?? "") || undefined,
        }) as Conversation,
    );
  } catch {
    return [];
  }
}

type MessageCursor = string; // `${createdAt}|${id}`

function makeMessageCursor(m: { createdAt: string; id: string }): MessageCursor {
  return `${String(m.createdAt)}|${String(m.id)}`;
}

function parseMessageCursor(cursor: MessageCursor): { createdAt: string; id: string } | null {
  const raw = String(cursor ?? "");
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length < 2) return null;
  const createdAt = String(parts[0] ?? "").trim();
  const id = String(parts[1] ?? "").trim();
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function queryMessagesPageSync(args: {
  scenarioId: string;
  conversationId: string;
  limit: number;
  cursor?: MessageCursor | null;
}): { items: Message[]; nextCursor: MessageCursor | null } {
  ensureSchemaSync();

  const sid = String(args.scenarioId ?? "").trim();
  const cid = String(args.conversationId ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(args.limit ?? 30)));
  const cur = args.cursor ? parseMessageCursor(args.cursor) : null;

  if (!sid || !cid) return { items: [], nextCursor: null };

  const db = getDbSync();

  const where: string[] = ["scenarioId = ?", "conversationId = ?"];
  const params: any[] = [sid, cid];

  if (cur) {
    where.push("(createdAt > ? OR (createdAt = ? AND id > ?))");
    params.push(cur.createdAt, cur.createdAt, cur.id);
  }

  const sql = `
    SELECT id, scenarioId, conversationId, senderProfileId, senderUserId, text, kind, createdAt, updatedAt, editedAt
    FROM messages
    WHERE ${where.join(" AND ")}
    ORDER BY createdAt ASC, id ASC
    LIMIT ?;
  `;

  params.push(limit);

  let rows: any[] = [];
  try {
    rows = db.getAllSync<any>(sql, params) as any;
  } catch {
    rows = [];
  }

  const ids = rows.map((r) => String(r.id)).filter(Boolean);
  const imgMap = new Map<string, string[]>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    try {
      const imgs = db.getAllSync<any>(
        `SELECT messageId, idx, url FROM message_images WHERE messageId IN (${placeholders}) ORDER BY messageId ASC, idx ASC;`,
        ids,
      );
      for (const r of imgs as any[]) {
        const mid = String(r.messageId ?? "");
        const url = String(r.url ?? "");
        if (!mid || !url) continue;
        const arr = imgMap.get(mid) ?? [];
        arr.push(url);
        imgMap.set(mid, arr);
      }
    } catch {
      // ignore
    }
  }

  const items: Message[] = rows
    .map((r) => {
      const id = String(r.id ?? "").trim();
      const createdAt = String(r.createdAt ?? "").trim();
      const senderProfileId = String(r.senderProfileId ?? "").trim();
      if (!id || !createdAt || !senderProfileId) return null;
      const imageUrls = imgMap.get(id);
      return {
        id,
        scenarioId: String(r.scenarioId ?? sid),
        conversationId: String(r.conversationId ?? cid),
        senderProfileId,
        senderUserId: String(r.senderUserId ?? "") || undefined,
        text: String(r.text ?? ""),
        kind: String(r.kind ?? "") || undefined,
        imageUrls,
        createdAt,
        updatedAt: String(r.updatedAt ?? "") || undefined,
        editedAt: String(r.editedAt ?? "") || undefined,
      } as Message;
    })
    .filter(Boolean) as Message[];

  const nextCursor = items.length === limit ? makeMessageCursor(items[items.length - 1] as any) : null;
  return { items, nextCursor };
}
