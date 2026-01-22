import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { ProfilePinApi, ProfilePinRow } from "./profilePinModels";
import { mapProfilePinRowToApi } from "./profilePinModels";

async function ensureProfilePinsTable(client: PoolClient) {
  // New table for per-profile pinned post (distinct from GM post pinning fields on posts).
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS profile_pins (
      profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
      updated_at timestamptz NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
    );
    `,
  );
  await client.query(`CREATE INDEX IF NOT EXISTS profile_pins_scenario_idx ON profile_pins(scenario_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS profile_pins_post_idx ON profile_pins(post_id);`);
}

async function scenarioAccess(client: PoolClient, scenarioId: string, userId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM scenarios s
    LEFT JOIN scenario_players sp
      ON sp.scenario_id = s.id
     AND sp.user_id = $2
    WHERE s.id = $1
      AND (
        s.owner_user_id = $2
        OR ($2 = ANY(COALESCE(s.gm_user_ids, '{}'::uuid[])))
        OR sp.user_id IS NOT NULL
      )
    LIMIT 1
  `,
    [scenarioId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function requireOwnedProfile(client: PoolClient, profileId: string, userId: string): Promise<{ scenarioId: string } | null> {
  const res = await client.query<{ scenario_id: string; owner_user_id: string | null; is_public: boolean | null }>(
    `SELECT scenario_id, owner_user_id, is_public FROM profiles WHERE id = $1 LIMIT 1`,
    [profileId],
  );
  const row0 = res.rows[0];
  if (!row0) return null;

  const ownerMatches = String(row0.owner_user_id ?? "").trim() === String(userId ?? "").trim();
  const isPublic = Boolean(row0.is_public);
  if (!ownerMatches && !isPublic) return null;

  return { scenarioId: String(row0.scenario_id) };
}

export async function listProfilePinsForScenario(args: {
  scenarioId: string;
  userId: string;
}): Promise<ProfilePinApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    try {
      await ensureProfilePinsTable(client);
    } catch {
      // If table creation fails (permissions), behave as if feature is unavailable.
      return [];
    }

    const res = await client.query<ProfilePinRow>(
      `
      SELECT profile_id, scenario_id, post_id, created_at, updated_at
      FROM profile_pins
      WHERE scenario_id = $1
      ORDER BY updated_at DESC, profile_id ASC
    `,
      [sid],
    );

    return res.rows.map(mapProfilePinRowToApi);
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export async function setPinnedPostForProfile(args: {
  userId: string;
  profileId: string;
  postId: string | null;
}): Promise<
  | { pinned: boolean; pin: ProfilePinApi | null }
  | { error: string; status: number }
  | null
> {
  const uid = String(args.userId ?? "").trim();
  const pid = String(args.profileId ?? "").trim();
  const postId = args.postId == null ? null : String(args.postId).trim();
  if (!uid || !pid) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await requireOwnedProfile(client, pid, uid);
    if (!owned) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    const sid = String(owned.scenarioId ?? "").trim();
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Invalid profile", status: 400 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    try {
      await ensureProfilePinsTable(client);
    } catch {
      await client.query("ROLLBACK");
      return { error: "Feature unavailable", status: 500 };
    }

    if (!postId) {
      await client.query(`DELETE FROM profile_pins WHERE profile_id = $1`, [pid]);
      await client.query("COMMIT");
      return { pinned: false, pin: null };
    }

    const postRes = await client.query<{ scenario_id: string }>(
      `SELECT scenario_id FROM posts WHERE id = $1 LIMIT 1`,
      [postId],
    );
    const postRow0 = postRes.rows[0];
    if (!postRow0) {
      await client.query("ROLLBACK");
      return { error: "Post not found", status: 404 };
    }
    if (String(postRow0.scenario_id) !== sid) {
      await client.query("ROLLBACK");
      return { error: "Post not in scenario", status: 400 };
    }

    const up = await client.query<ProfilePinRow>(
      `
      INSERT INTO profile_pins (profile_id, scenario_id, post_id, created_at, updated_at)
      VALUES ($1, $2, $3, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
      ON CONFLICT (profile_id) DO UPDATE
        SET post_id = EXCLUDED.post_id,
            scenario_id = EXCLUDED.scenario_id,
            updated_at = NOW() AT TIME ZONE 'UTC'
      RETURNING profile_id, scenario_id, post_id, created_at, updated_at
      `,
      [pid, sid, postId],
    );

    await client.query("COMMIT");

    const row = up.rows[0];
    return { pinned: true, pin: row ? mapProfilePinRowToApi(row) : null };
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return { error: "Invalid request", status: 400 };
  } finally {
    client.release();
  }
}
