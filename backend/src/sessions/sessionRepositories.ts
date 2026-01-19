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
  keepTokenHash: string;
}): Promise<{ revokedCount: number } | null> {
  const exists = await userSessionsTableExists();
  if (!exists) {
    return null;
  }

  const userId = String(args.userId ?? "").trim();
  const keep = String(args.keepTokenHash ?? "").trim();
  if (!userId || !keep) return null;

  const res = await pool.query<{ revoked_count: string }>(
    `
    WITH updated AS (
      UPDATE user_sessions
      SET revoked_at = now(),
          revoked_reason = 'logout_others'
      WHERE user_id = $1
        AND token_hash <> $2
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
