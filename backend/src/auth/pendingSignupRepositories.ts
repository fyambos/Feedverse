import { pool } from "../config/database";

function normalizeIp(ip: unknown): string | null {
  if (ip == null) return null;
  if (Array.isArray(ip)) {
    const first = String(ip[0] ?? "").trim();
    return first || null;
  }
  const raw = String(ip).trim();
  if (!raw) return null;
  return raw.split(",")[0]?.trim() || null;
}

export async function upsertPendingSignupVerification(args: {
  email: string;
  username: string;
  codeHash: string;
  expiresAt: Date;
  requestIp: unknown;
  requestUserAgent: string | null;
}): Promise<{ id: string } | null> {
  const email = String(args.email ?? "").trim().toLowerCase();
  const username = String(args.username ?? "").trim();
  const codeHash = String(args.codeHash ?? "").trim();
  if (!email || !username || !codeHash) return null;

  const requestIp = normalizeIp(args.requestIp);
  const requestUserAgent = args.requestUserAgent == null ? null : String(args.requestUserAgent).trim() || null;

  const q = `
    INSERT INTO pending_signup_verifications (
      email,
      username,
      code_hash,
      expires_at,
      request_ip,
      request_user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ((LOWER(TRIM(email)))) WHERE used_at IS NULL
    DO UPDATE SET
      username = EXCLUDED.username,
      code_hash = EXCLUDED.code_hash,
      attempt_count = 0,
      expires_at = EXCLUDED.expires_at,
      request_ip = EXCLUDED.request_ip,
      request_user_agent = EXCLUDED.request_user_agent,
      created_at = now()
    RETURNING id
  `;

  const res = await pool.query<{ id: string }>(q, [email, username, codeHash, args.expiresAt, requestIp, requestUserAgent]);
  const row = res.rows?.[0];
  if (!row?.id) return null;
  return { id: String(row.id) };
}

export type ConsumePendingSignupResult =
  | { ok: true; id: string; email: string; username: string }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid" | "mismatch" };

export async function consumePendingSignupVerification(args: {
  email: string;
  username: string;
  codeHash: string;
  maxAttempts: number;
  usedIp: unknown;
  usedUserAgent: string | null;
}): Promise<ConsumePendingSignupResult> {
  const email = String(args.email ?? "").trim().toLowerCase();
  const username = String(args.username ?? "").trim();
  const codeHash = String(args.codeHash ?? "").trim();
  const maxAttempts = Math.max(1, Number(args.maxAttempts) || 5);
  if (!email || !username || !codeHash) return { ok: false, reason: "not_found" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const active = await client.query<{
      id: string;
      email: string;
      username: string;
      code_hash: string;
      attempt_count: number;
      expires_at: Date;
    }>(
      `
      SELECT id, email, username, code_hash, attempt_count, expires_at
      FROM pending_signup_verifications
      WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
        AND used_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [email],
    );

    const row = active.rows?.[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }

    if (String(row.username ?? "").trim() !== username) {
      await client.query("COMMIT");
      return { ok: false, reason: "mismatch" };
    }

    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    if (!expiresAt || expiresAt.valueOf() <= Date.now()) {
      await client.query(
        `UPDATE pending_signup_verifications SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
        [row.id],
      );
      await client.query("COMMIT");
      return { ok: false, reason: "expired" };
    }

    const attempts = Number(row.attempt_count ?? 0) || 0;
    if (attempts >= maxAttempts) {
      await client.query("COMMIT");
      return { ok: false, reason: "too_many_attempts" };
    }

    if (String(row.code_hash) !== codeHash) {
      await client.query(
        `UPDATE pending_signup_verifications SET attempt_count = attempt_count + 1 WHERE id = $1`,
        [row.id],
      );
      await client.query("COMMIT");
      return { ok: false, reason: "invalid" };
    }

    const usedIp = normalizeIp(args.usedIp);
    const usedUserAgent = args.usedUserAgent == null ? null : String(args.usedUserAgent).trim() || null;

    await client.query(
      `
      UPDATE pending_signup_verifications
      SET used_at = now(),
          used_ip = $2,
          used_user_agent = $3
      WHERE id = $1
        AND used_at IS NULL
      `,
      [row.id, usedIp, usedUserAgent],
    );

    await client.query("COMMIT");
    return { ok: true, id: String(row.id), email: String(row.email), username: String(row.username) };
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    return { ok: false, reason: "not_found" };
  } finally {
    client.release();
  }
}
