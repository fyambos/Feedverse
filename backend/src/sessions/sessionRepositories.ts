import crypto from "crypto";
import { pool } from "../config/database";
import type { UserSessionRow } from "./sessionModels";

let sessionsTableExistsCache: boolean | null = null;

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS exists
    `,
    [tableName],
  );
  return Boolean(res.rows?.[0]?.exists);
}

export async function userSessionsTableExists(): Promise<boolean> {
  if (sessionsTableExistsCache != null) return sessionsTableExistsCache;
  try {
    sessionsTableExistsCache = await tableExists("user_sessions");
  } catch {
    sessionsTableExistsCache = false;
  }
  return sessionsTableExistsCache;
}

export function hashTokenSha256Hex(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(args: {
  sessionId: string;
  userId: string;
  tokenHash: string;
  refreshTokenHash: string | null;
  refreshExpiresAt: Date | null;
  userAgent: string | null;
  ip: unknown;
}): Promise<{ revokedAt: Date | null; sessionUserId: string } | null> {
  const exists = await userSessionsTableExists();
  if (!exists) return null;

  const sessionId = String(args.sessionId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  const tokenHash = String(args.tokenHash ?? "").trim();
  if (!sessionId || !userId || !tokenHash) return null;

  const userAgent = args.userAgent == null ? null : String(args.userAgent).trim() || null;
  const ip = normalizeIp(args.ip);
  const refreshTokenHash = args.refreshTokenHash == null ? null : String(args.refreshTokenHash).trim() || null;
  const refreshExpiresAt = args.refreshExpiresAt ?? null;

  const res = await pool.query<Pick<UserSessionRow, "user_id" | "revoked_at">>(
    `
    INSERT INTO user_sessions (
      id,
      user_id,
      token_hash,
      refresh_token_hash,
      refresh_expires_at,
      user_agent,
      ip,
      created_at,
      last_seen_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      now(),
      now()
    )
    ON CONFLICT (token_hash) DO UPDATE
    SET
      last_seen_at = now(),
      user_agent = COALESCE(user_sessions.user_agent, EXCLUDED.user_agent),
      ip = COALESCE(user_sessions.ip, EXCLUDED.ip)
    RETURNING user_id, revoked_at
    `,
    [sessionId, userId, tokenHash, refreshTokenHash, refreshExpiresAt, userAgent, ip],
  );

  const row = res.rows?.[0];
  if (!row) return null;

  return {
    sessionUserId: String((row as any).user_id ?? ""),
    revokedAt: (row as any).revoked_at ?? null,
  };
}

export async function touchUserSessionById(args: {
  sessionId: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: unknown;
}): Promise<{ revokedAt: Date | null; sessionUserId: string } | null> {
  const exists = await userSessionsTableExists();
  if (!exists) return null;

  const sessionId = String(args.sessionId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  const tokenHash = String(args.tokenHash ?? "").trim();
  if (!sessionId || !userId || !tokenHash) return null;

  const userAgent = args.userAgent == null ? null : String(args.userAgent).trim() || null;
  const ip = normalizeIp(args.ip);

  const res = await pool.query<Pick<UserSessionRow, "user_id" | "revoked_at">>(
    `
    UPDATE user_sessions
    SET
      last_seen_at = now(),
      token_hash = $3,
      user_agent = COALESCE(user_sessions.user_agent, $4),
      ip = COALESCE(user_sessions.ip, $5)
    WHERE id = $1
      AND user_id = $2
    RETURNING user_id, revoked_at
    `,
    [sessionId, userId, tokenHash, userAgent, ip],
  );

  const row = res.rows?.[0];
  if (!row) return null;

  return {
    sessionUserId: String((row as any).user_id ?? ""),
    revokedAt: (row as any).revoked_at ?? null,
  };
}

export async function findUserSessionByRefreshTokenHash(args: {
  refreshTokenHash: string;
}): Promise<Pick<UserSessionRow, "id" | "user_id" | "revoked_at" | "refresh_expires_at"> | null> {
  const exists = await userSessionsTableExists();
  if (!exists) return null;

  const refreshTokenHash = String(args.refreshTokenHash ?? "").trim();
  if (!refreshTokenHash) return null;

  const res = await pool.query<
    Pick<UserSessionRow, "id" | "user_id" | "revoked_at" | "refresh_expires_at">
  >(
    `
    SELECT id, user_id, revoked_at, refresh_expires_at
    FROM user_sessions
    WHERE refresh_token_hash = $1
    LIMIT 1
    `,
    [refreshTokenHash],
  );

  return res.rows?.[0] ?? null;
}

export async function rotateUserSessionRefreshToken(args: {
  sessionId: string;
  userId: string;
  nextRefreshTokenHash: string;
  nextRefreshExpiresAt: Date;
  nextTokenHash: string;
}): Promise<boolean> {
  const exists = await userSessionsTableExists();
  if (!exists) return false;

  const sessionId = String(args.sessionId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  const nextRefreshTokenHash = String(args.nextRefreshTokenHash ?? "").trim();
  const nextTokenHash = String(args.nextTokenHash ?? "").trim();
  if (!sessionId || !userId || !nextRefreshTokenHash || !nextTokenHash) return false;

  const res = await pool.query(
    `
    UPDATE user_sessions
    SET
      refresh_token_hash = $3,
      refresh_expires_at = $4,
      token_hash = $5,
      last_seen_at = now()
    WHERE id = $1
      AND user_id = $2
      AND revoked_at IS NULL
    `,
    [sessionId, userId, nextRefreshTokenHash, args.nextRefreshExpiresAt, nextTokenHash],
  );

  return (res.rowCount ?? 0) > 0;
}

export async function revokeUserSessionById(args: {
  sessionId: string;
  userId: string;
  reason: string;
}): Promise<boolean> {
  const exists = await userSessionsTableExists();
  if (!exists) return false;

  const sessionId = String(args.sessionId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  const reason = String(args.reason ?? "").trim() || "logout";
  if (!sessionId || !userId) return false;

  const res = await pool.query(
    `
    UPDATE user_sessions
    SET revoked_at = now(),
        revoked_reason = $3
    WHERE id = $1
      AND user_id = $2
      AND revoked_at IS NULL
    `,
    [sessionId, userId, reason],
  );

  return (res.rowCount ?? 0) > 0;
}

function normalizeIp(ip: unknown): string | null {
  if (ip == null) return null;
  if (Array.isArray(ip)) {
    const first = String(ip[0] ?? "").trim();
    return first || null;
  }
  const raw = String(ip).trim();
  if (!raw) return null;
  // x-forwarded-for can be a comma-separated list.
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

export async function touchUserSession(args: {
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: unknown;
}): Promise<{ revokedAt: Date | null; sessionUserId: string } | null> {
  const exists = await userSessionsTableExists();
  if (!exists) {
    return null;
  }

  const userId = String(args.userId ?? "").trim();
  const tokenHash = String(args.tokenHash ?? "").trim();
  if (!userId || !tokenHash) return null;

  const userAgent = args.userAgent == null ? null : String(args.userAgent).trim() || null;
  const ip = normalizeIp(args.ip);

  const res = await pool.query<Pick<UserSessionRow, "user_id" | "revoked_at">>(
    `
    INSERT INTO user_sessions (
      user_id,
      token_hash,
      user_agent,
      ip,
      created_at,
      last_seen_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      now(),
      now()
    )
    ON CONFLICT (token_hash) DO UPDATE
    SET
      last_seen_at = now(),
      user_agent = COALESCE(user_sessions.user_agent, EXCLUDED.user_agent),
      ip = COALESCE(user_sessions.ip, EXCLUDED.ip)
    RETURNING user_id, revoked_at
    `,
    [userId, tokenHash, userAgent, ip],
  );

  const row = res.rows?.[0];
  if (!row) return null;

  const out = {
    sessionUserId: String((row as any).user_id ?? ""),
    revokedAt: (row as any).revoked_at ?? null,
  };
  return out;
}

export async function listActiveUserSessions(args: {
  userId: string;
}): Promise<Array<Pick<UserSessionRow, "id" | "token_hash" | "user_agent" | "ip" | "created_at" | "last_seen_at">>> {
  const exists = await userSessionsTableExists();
  if (!exists) return [];

  const userId = String(args.userId ?? "").trim();
  if (!userId) return [];

  const res = await pool.query<
    Pick<UserSessionRow, "id" | "token_hash" | "user_agent" | "ip" | "created_at" | "last_seen_at">
  >(
    `
    SELECT id, token_hash, user_agent, ip, created_at, last_seen_at
    FROM user_sessions
    WHERE user_id = $1
      AND revoked_at IS NULL
    ORDER BY last_seen_at DESC, id DESC
    LIMIT 50
    `,
    [userId],
  );

  return res.rows ?? [];
}

export async function revokeOtherUserSessions(args: {
  userId: string;
  keepSessionId: string;
}): Promise<{ revokedCount: number } | null> {
  const exists = await userSessionsTableExists();
  if (!exists) {
    return null;
  }

  const userId = String(args.userId ?? "").trim();
  const keep = String(args.keepSessionId ?? "").trim();
  if (!userId || !keep) return null;

  const res = await pool.query<{ revoked_count: string }>(
    `
    WITH updated AS (
      UPDATE user_sessions
      SET revoked_at = now(),
          revoked_reason = 'logout_others'
      WHERE user_id = $1
        AND id <> $2
        AND revoked_at IS NULL
      RETURNING 1
    )
    SELECT COUNT(*)::text AS revoked_count FROM updated
    `,
    [userId, keep],
  );

  const count = Number.parseInt(String(res.rows?.[0]?.revoked_count ?? "0"), 10);
  const revokedCount = Number.isFinite(count) ? count : 0;
  return { revokedCount };
}
