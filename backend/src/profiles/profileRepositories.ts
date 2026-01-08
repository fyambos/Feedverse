import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { ProfileApi, ProfileRow } from "./profileModels";
import { mapProfileRowToApi } from "./profileModels";

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

async function userInScenario(client: PoolClient, scenarioId: string, userId: string): Promise<boolean> {
  // Same as access check, but kept separate for readability.
  return scenarioAccess(client, scenarioId, userId);
}

async function handleTaken(client: PoolClient, scenarioId: string, handle: string, excludeProfileId?: string): Promise<boolean> {
  const params: any[] = [scenarioId, handle];
  let sql = `SELECT 1 FROM profiles WHERE scenario_id = $1 AND LOWER(handle) = LOWER($2)`;
  if (excludeProfileId) {
    params.push(excludeProfileId);
    sql += ` AND id <> $3`;
  }
  sql += ` LIMIT 1`;

  const res = await client.query(sql, params);
    return (res.rowCount ?? 0) > 0;
}

export async function listProfilesForScenario(args: {
  scenarioId: string;
  userId: string;
}): Promise<ProfileApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<ProfileRow>(
      `
      SELECT
        p.id,
        p.scenario_id,
        p.owner_user_id,
        p.display_name,
        p.handle,
        p.avatar_url,
        p.header_url,
        p.bio,
        p.is_public,
        p.is_private,
        p.joined_date,
        p.location,
        p.link,
        p.follower_count,
        p.following_count,
        p.created_at,
        p.updated_at,
        u.id AS owner_id,
        u.username AS owner_username,
        u.avatar_url AS owner_avatar_url
      FROM profiles p
      LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE p.scenario_id = $1
      ORDER BY p.created_at ASC, p.id ASC
    `,
      [sid],
    );

    return res.rows.map((r: any) => {
      const base = mapProfileRowToApi(r as ProfileRow);
      const ownerId = r.owner_id != null ? String(r.owner_id) : '';
      if (ownerId) {
        base.owner = {
          id: ownerId,
          username: r.owner_username != null ? String(r.owner_username) : undefined,
          avatarUrl: r.owner_avatar_url != null ? String(r.owner_avatar_url) : null,
        };
      }
      return base;
    });
  } finally {
    client.release();
  }
}

export async function createProfileForScenario(args: {
  scenarioId: string;
  userId: string;
  input: {
    displayName: string;
    handle: string;
    avatarUrl?: string | null;
    headerUrl?: string | null;
    bio?: string | null;
    isPublic?: boolean | null;
    isPrivate?: boolean | null;
    joinedDate?: string | null;
    location?: string | null;
    link?: string | null;
    followerCount?: number | null;
    followingCount?: number | null;
  };
}): Promise<{ profile: ProfileApi } | { error: string; status: number } | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const displayName = String(args.input?.displayName ?? "").trim();
  const handle = String(args.input?.handle ?? "").trim();
  if (!displayName) return { error: "displayName is required", status: 400 };
  if (!handle) return { error: "handle is required", status: 400 };

  const avatarUrl = args.input?.avatarUrl != null ? String(args.input.avatarUrl) : "";
  const followerCount = Number.isFinite(Number(args.input?.followerCount)) ? Number(args.input?.followerCount) : 0;
  const followingCount = Number.isFinite(Number(args.input?.followingCount)) ? Number(args.input?.followingCount) : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const taken = await handleTaken(client, sid, handle);
    if (taken) {
      await client.query("ROLLBACK");
      return { error: "Handle taken", status: 409 };
    }

    const res = await client.query<ProfileRow>(
      `
      INSERT INTO profiles (
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        NOW() AT TIME ZONE 'UTC',
        NOW() AT TIME ZONE 'UTC'
      )
      RETURNING
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
    `,
      [
        sid,
        uid,
        displayName,
        handle,
        avatarUrl,
        args.input?.headerUrl ?? null,
        args.input?.bio ?? null,
        args.input?.isPublic ?? false,
        args.input?.isPrivate ?? false,
        args.input?.joinedDate ?? null,
        args.input?.location ?? null,
        args.input?.link ?? null,
        followerCount,
        followingCount,
      ],
    );

    await client.query("COMMIT");

    const row = res.rows[0];
    if (!row) return { error: "Insert failed", status: 500 };
    return { profile: mapProfileRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Insert failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function updateProfile(args: {
  profileId: string;
  userId: string;
  patch: Record<string, any>;
}): Promise<{ profile: ProfileApi } | { error: string; status: number } | null> {
  const pid = String(args.profileId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const patch = args.patch ?? {};
  const allowed: Array<[string, string, (v: any) => any]> = [
    ["displayName", "display_name", (v) => String(v ?? "").trim()],
    ["handle", "handle", (v) => String(v ?? "").trim()],
    ["avatarUrl", "avatar_url", (v) => String(v ?? "")],
    ["headerUrl", "header_url", (v) => (v == null ? null : String(v))],
    ["bio", "bio", (v) => (v == null ? null : String(v))],
    ["isPublic", "is_public", (v) => Boolean(v)],
    ["isPrivate", "is_private", (v) => Boolean(v)],
    ["joinedDate", "joined_date", (v) => (v == null ? null : String(v))],
    ["location", "location", (v) => (v == null ? null : String(v))],
    ["link", "link", (v) => (v == null ? null : String(v))],
    ["followerCount", "follower_count", (v) => (v == null ? null : Number(v))],
    ["followingCount", "following_count", (v) => (v == null ? null : Number(v))],
  ];

  const setParts: string[] = [];
  const values: any[] = [];
  for (const [k, col, cast] of allowed) {
    if (!(k in patch)) continue;
    const v = cast((patch as any)[k]);
    // basic required fields if present
    if (col === "display_name" && !String(v).trim()) continue;
    if (col === "handle" && !String(v).trim()) continue;

    values.push(v);
    setParts.push(`${col} = $${values.length}`);
  }

  if (setParts.length === 0) {
    return { error: "No valid fields to update", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<ProfileRow>(
      `
      SELECT
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Profile not found", status: 404 };
    }

    // Allow updates if the requester is the owner OR the profile is public.
    // Also allow when the incoming patch is explicitly setting `isPublic: true` —
    // this lets a user make a profile public and apply edits in one request.
    const requestedIsPublic = (patch as any).isPublic != null ? Boolean((patch as any).isPublic) : false;
    if (String(row0.owner_user_id) !== uid && !Boolean(row0.is_public) && !requestedIsPublic) {
      // Diagnostic log to help debug edit attempts on public profiles
      /*
      console.log("updateProfile: permission denied", {
        profileId: pid,
        owner_user_id: String(row0.owner_user_id ?? ""),
        is_public: Boolean(row0.is_public),
        is_private: Boolean(row0.is_private),
        requestedIsPublic,
        requestUserId: uid,
      });
      */
      await client.query("ROLLBACK");
      return null;
    }

    const nextHandle = (patch as any).handle != null ? String((patch as any).handle).trim() : null;
    if (nextHandle && (await handleTaken(client, String(row0.scenario_id), nextHandle, pid))) {
      await client.query("ROLLBACK");
      return { error: "Handle taken", status: 409 };
    }

    // If requester is the owner, restrict update to owner_user_id = userId for safety.
    // Otherwise (allowed because profile is public or the request makes it public),
    // allow updating the row by id only.
    const ownerMatches = String(row0.owner_user_id ?? "") === uid;

    // Append WHERE args after the SET args so placeholders align.
    if (ownerMatches) {
      values.push(pid);
      values.push(uid);
    } else {
      values.push(pid);
    }

    const whereClause = ownerMatches
      ? `WHERE id = $${values.length - 1} AND owner_user_id = $${values.length}`
      : `WHERE id = $${values.length}`;

      // Debug: log the constructed SET parts and parameter values to diagnose type/ordering or type issues
      try {
        /*
        console.log("updateProfile: debug", {
          profileId: pid,
          setParts,
          valuesPreview: values.map((v) => ({ type: typeof v, value: v })),
          ownerMatches,
          requestedIsPublic,
          rowOwner: String(row0.owner_user_id ?? ""),
        });
        */
      } catch (e) {
        // ignore logging errors
      }

      const res = await client.query<ProfileRow>(
      `
      UPDATE profiles
      SET ${setParts.join(", ")}, updated_at = NOW() AT TIME ZONE 'UTC'
      ${whereClause}
      RETURNING
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
    `,
      values,
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query("COMMIT");
    return { profile: mapProfileRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Update failed", status: 400 };
  } finally {
    client.release();
  }
}

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
  `,
    [name],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteProfileCascade(args: {
  profileId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number } | null> {
  const pid = String(args.profileId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<ProfileRow>(
      `
      SELECT id, scenario_id, owner_user_id, display_name, handle, avatar_url, header_url, bio,
             is_public, is_private, joined_date, location, link, follower_count, following_count,
             created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Profile not found", status: 404 };
    }

    if (String(row0.owner_user_id) !== uid) {
      await client.query("ROLLBACK");
      return null;
    }

    // Best-effort cascade to known tables if they exist (schema may vary).
    if (await tableExists(client, "messages")) {
      await client.query("DELETE FROM messages WHERE sender_profile_id = $1", [pid]);
    }
    if (await tableExists(client, "conversation_participants")) {
      await client.query("DELETE FROM conversation_participants WHERE profile_id = $1", [pid]);
    }
    if (await tableExists(client, "likes")) {
      await client.query("DELETE FROM likes WHERE profile_id = $1", [pid]);
    }
    if (await tableExists(client, "reposts")) {
      await client.query("DELETE FROM reposts WHERE profile_id = $1", [pid]);
    }
    if (await tableExists(client, "posts")) {
      await client.query("DELETE FROM posts WHERE author_profile_id = $1", [pid]);
    }

    const del = await client.query("DELETE FROM profiles WHERE id = $1 AND owner_user_id = $2", [pid, uid]);
      if ((del.rowCount ?? 0) <= 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Delete failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function adoptPublicProfile(args: {
  profileId: string;
  userId: string;
}): Promise<{ profile: ProfileApi } | { error: string; status: number } | null> {
  const pid = String(args.profileId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<ProfileRow>(
      `
      SELECT
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Profile not found", status: 404 };
    }

    if (String(row0.owner_user_id) === uid) {
      await client.query("ROLLBACK");
      return { error: "You already own this profile", status: 400 };
    }

    if (!Boolean(row0.is_public)) {
      await client.query("ROLLBACK");
      return { error: "Profile not shared", status: 400 };
    }

    const inScenario = await userInScenario(client, String(row0.scenario_id), uid);
    if (!inScenario) {
      await client.query("ROLLBACK");
      return null;
    }

    const res = await client.query<ProfileRow>(
      `
      UPDATE profiles
      SET owner_user_id = $1,
          is_public = false,
          is_private = true,
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $2
        AND is_public = true
      RETURNING
        id,
        scenario_id,
        owner_user_id,
        display_name,
        handle,
        avatar_url,
        header_url,
        bio,
        is_public,
        is_private,
        joined_date,
        location,
        link,
        follower_count,
        following_count,
        created_at,
        updated_at
    `,
      [uid, pid],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Adoption failed", status: 400 };
    }

    await client.query("COMMIT");
    return { profile: mapProfileRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Adoption failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function transferProfiles(args: {
  scenarioId: string;
  userId: string;
  profileIds: string[];
  toUserId: string;
}): Promise<{ ok: true; transferred: number; skipped: string[] } | { error: string; status: number } | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const to = String(args.toUserId ?? "").trim();
  const ids = (args.profileIds ?? []).map(String).filter(Boolean);

  if (!sid || !uid) return null;
  if (!to) return { error: "toUserId is required", status: 400 };
  if (ids.length === 0) return { error: "profileIds is required", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    // target must be in scenario_players (or owner/gm)
    const targetOk = await scenarioAccess(client, sid, to);
    if (!targetOk) {
      await client.query("ROLLBACK");
      return { error: "Target user not in scenario", status: 400 };
    }

    const scenarioOwner = await client.query(
      "SELECT owner_user_id FROM scenarios WHERE id = $1 LIMIT 1",
      [sid],
    );
    const ownerId = String(scenarioOwner.rows?.[0]?.owner_user_id ?? "");
    const isScenarioOwner = ownerId && ownerId === uid;

    const attemptedUnique = Array.from(new Set(ids));
    const skipped: string[] = [];
    let transferred = 0;

    for (const pid of attemptedUnique) {
      const pRes = await client.query(
        "SELECT id, owner_user_id, scenario_id FROM profiles WHERE id = $1 LIMIT 1",
        [pid],
      );
      const p = pRes.rows[0];
      if (!p) {
        skipped.push(pid);
        continue;
      }

      if (String(p.scenario_id) !== sid) {
        skipped.push(pid);
        continue;
      }

      const currentOwner = String(p.owner_user_id ?? "");
      const canTransfer = currentOwner === uid || isScenarioOwner;
      if (!canTransfer) {
        skipped.push(pid);
        continue;
      }

      if (currentOwner === to) continue;

      const upd = await client.query(
        "UPDATE profiles SET owner_user_id = $1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $2",
        [to, pid],
      );

        if ((upd.rowCount ?? 0) > 0) transferred += 1;
    }

    await client.query("COMMIT");
    return { ok: true, transferred, skipped };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Transfer failed", status: 400 };
  } finally {
    client.release();
  }
}
