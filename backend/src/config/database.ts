import { Pool } from "pg";
import {
  DATABASE_URL,
  DATABASE_HOST,
  DATABASE_USER,
  DATABASE_PORT,
  DATABASE_PASSWORD,
  DATABASE_NAME,
  DATABASE_SSL_MODE,
  DB_POOL_CONNECTION_TIMEOUT_MS,
  DB_POOL_IDLE_TIMEOUT_MS,
  DB_POOL_MAX,
  DB_POOL_MAX_USES,
  DB_STARTUP_CHECK_ENABLED,
  DB_STARTUP_RETRY_ATTEMPTS,
  DB_STARTUP_RETRY_BASE_DELAY_MS,
  DB_STARTUP_RETRY_MAX_DELAY_MS,
} from "./constants";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;

  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// const { Pool } = pg;

export const pool = new Pool({
  ...(DATABASE_URL
    ? { connectionString: DATABASE_URL }
    : {
        host: DATABASE_HOST,
        user: DATABASE_USER,
        port: DATABASE_PORT,
        password: DATABASE_PASSWORD,
        database: DATABASE_NAME,
      }),
  ssl: DATABASE_SSL_MODE,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_POOL_CONNECTION_TIMEOUT_MS,
  ...(DB_POOL_MAX_USES != null ? { maxUses: DB_POOL_MAX_USES } : {}),
});

// pg Pool emits this when an idle client errors (e.g., network flap).
pool.on("error", (err) => {
  // Avoid circular import of logger from here; server logs will still capture errors.
  // eslint-disable-next-line no-console
  console.error("[db] pool error", err);
});

export type DbPingResult =
  | { ok: true; latencyMs: number }
  | { ok: false; latencyMs?: number; error: string };

export async function dbPing(args?: { timeoutMs?: number }): Promise<DbPingResult> {
  const timeoutMs = args?.timeoutMs ?? 1500;
  const t0 = Date.now();
  try {
    await withTimeout(pool.query("SELECT 1"), timeoutMs, "dbPing");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e: any) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: String(e?.message ?? e ?? "DB ping failed"),
    };
  }
}

export async function waitForDatabaseReady(): Promise<DbPingResult> {
  if (!DB_STARTUP_CHECK_ENABLED) {
    return { ok: true, latencyMs: 0 };
  }

  const attempts = Math.max(1, DB_STARTUP_RETRY_ATTEMPTS);
  const baseDelay = Math.max(50, DB_STARTUP_RETRY_BASE_DELAY_MS);
  const maxDelay = Math.max(baseDelay, DB_STARTUP_RETRY_MAX_DELAY_MS);

  let last: DbPingResult = { ok: false, error: "DB not checked" };

  for (let i = 1; i <= attempts; i++) {
    last = await dbPing({ timeoutMs: Math.min(2500, DB_POOL_CONNECTION_TIMEOUT_MS) });
    if (last.ok) return last;

    const exp = Math.min(maxDelay, baseDelay * 2 ** (i - 1));
    const jitter = 0.3;
    const delay = Math.round(exp * (1 - jitter + Math.random() * 2 * jitter));
    await sleep(delay);
  }

  return last;
}
