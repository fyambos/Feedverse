// backend/src/conversations/conversationRepositories.ts

import type { PoolClient } from "pg";
import { pool } from "../config/database";
import { r2Service } from "../config/cloudflare/r2Service";
import type { ConversationApi, ConversationRow } from "./conversationModels";
import { mapConversationRowToApi } from "./conversationModels";
import realtimeService from "../realtime/realtimeService";
import websocketService from "../realtime/websocketService";

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
  const ok = (res.rowCount ?? 0) > 0;
  return ok;
}

async function isScenarioOwnerOrGm(client: PoolClient, scenarioId: string, userId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM scenarios
    WHERE id = $1
      AND (
        owner_user_id = $2
        OR ($2 = ANY(COALESCE(gm_user_ids, '{}'::uuid[])))
      )
    LIMIT 1
  `,
    [scenarioId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function userOwnsAnyProfileInConversation(client: PoolClient, conversationId: string, userId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.profile_id
    WHERE cp.conversation_id = $1
      AND p.owner_user_id = $2
    LIMIT 1
  `,
    [conversationId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function validateProfilesInScenario(client: PoolClient, scenarioId: string, profileIds: string[]): Promise<boolean> {
  if (profileIds.length === 0) return false;
  const res = await client.query(
    `
    SELECT COUNT(*)::int AS c
    FROM profiles
    WHERE scenario_id = $1
      AND id = ANY($2::uuid[])
  `,
    [scenarioId, profileIds],
  );

  const c = Number(res.rows?.[0]?.c ?? 0);
  return c === profileIds.length;
}

/**
 * Mark all unread messages in a conversation as read for a given profile.
 * Returns number of rows updated.
 */
export async function markConversationMessagesRead(conversationId: string, profileId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      UPDATE messages
      SET is_read = TRUE,
          read = TRUE,
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE conversation_id = $1
        AND recipient_profile_id = $2
        AND (is_read IS NOT TRUE OR read IS NOT TRUE)
    `,
      [conversationId, profileId],
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

/**
 * Get unread counts per conversation for a profile within a scenario.
 * Returns array of { conversation_id, unread_count }.
 */
export async function getUnreadCountsForProfile(scenarioId: string, profileId: string): Promise<Array<{ conversation_id: string; unread_count: number }>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT conversation_id, COUNT(*)::int AS unread_count
      FROM messages
      WHERE scenario_id = $1
        AND recipient_profile_id = $2
        AND (is_read IS NOT TRUE OR read IS NOT TRUE)
      GROUP BY conversation_id
    `,
      [scenarioId, profileId],
    );
    return result.rows.map((r: any) => ({ conversation_id: String(r.conversation_id), unread_count: Number(r.unread_count) }));
  } finally {
    client.release();
  }
}

export async function listConversationsForScenario(args: { scenarioId: string; userId: string; selectedProfileId: string }): Promise<ConversationApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  const selectedProfileId = String(args.selectedProfileId ?? "").trim();
  if (!sid || !userId || !selectedProfileId) return null;

  const client = await pool.connect();
  try {
    // Scenario access: check that the user is a scenario player
    const ok = await scenarioAccess(client, sid, userId);
    if (!ok) return null;

    // Check that the selected profile is in the scenario
    const profileCheck = await client.query(
      `SELECT 1 FROM profiles WHERE scenario_id = $1 AND id = $2 LIMIT 1`,
      [sid, selectedProfileId],
    );
    if (profileCheck.rowCount === 0) return null;

    // Enforce visibility: selected profile must be owned by the requester or be public
    const profileMeta = await client.query(`SELECT owner_user_id, is_public FROM profiles WHERE id = $1 LIMIT 1`, [selectedProfileId]);
    const p = profileMeta.rows?.[0];
    if (!p) return null;
    const ownerMatches = String(p.owner_user_id ?? "") === userId;
    const isPublic = Boolean(p.is_public);
    if (!ownerMatches && !isPublic) return null;

    // Filter conversations by selectedProfileId participation
    const res = await client.query<ConversationRow>(
      `
      SELECT
        c.id,
        c.scenario_id,
        c.title,
        c.avatar_url,
        COALESCE(array_agg(cp.profile_id ORDER BY cp.profile_id) FILTER (WHERE cp.profile_id IS NOT NULL), '{}'::uuid[])::text[]
          AS participant_profile_ids,
        c.created_at,
        c.updated_at,
        c.last_message_at,
        lm.last_message_text,
        lm.last_message_kind,
        lm.last_message_sender_profile_id
      FROM conversations c
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN NULLIF(m.text, '') IS NOT NULL THEN m.text
            WHEN array_length(m.image_urls, 1) > 0 THEN 'Photo'
            WHEN m.kind IS NOT NULL AND m.kind <> 'text' THEN m.kind
            ELSE ''
          END AS last_message_text,
          m.kind AS last_message_kind,
          m.sender_profile_id AS last_message_sender_profile_id
        FROM messages m
        WHERE m.scenario_id = c.scenario_id
          AND m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.scenario_id = $1
        AND EXISTS (
          SELECT 1
          FROM conversation_participants cp2
          WHERE cp2.conversation_id = c.id
            AND cp2.profile_id = $2
          LIMIT 1
        )
      GROUP BY c.id, lm.last_message_text, lm.last_message_kind, lm.last_message_sender_profile_id
      ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC NULLS LAST, c.created_at DESC, c.id DESC
    `,
      [sid, selectedProfileId],
    );

    return res.rows.map(mapConversationRowToApi);
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export async function getOrCreateConversation(args: {
  scenarioId: string;
  userId: string;
  participantProfileIds: string[];
  title?: string;
  avatarUrl?: string;
}): Promise<{ conversation: ConversationApi } | { error: string; status: number } | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const ids = Array.from(new Set((args.participantProfileIds ?? []).map(String).map((s) => s.trim()).filter(Boolean)));

  if (!sid || !uid) return null;
  if (ids.length < 1) return { error: "participantProfileIds must have 1+ ids", status: 400 };

  const title = args.title != null ? String(args.title).trim() : "";
  const avatarUrl = args.avatarUrl != null ? String(args.avatarUrl).trim() : "";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return { error: "Forbidden", status: 403 };
    }
    // Allow sending as any profile in the scenario, regardless of ownership

    
    const allInScenario = await validateProfilesInScenario(client, sid, ids);
    if (!allInScenario) {
      await client.query("ROLLBACK");
      return { error: "Participants must belong to scenario", status: 400 };
    }

    // Try find existing conversation with exact participant set.
    const sorted = ids.slice().sort();

    const findRes = await client.query<{ id: string }>(
      `
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.scenario_id = $1
      GROUP BY c.id
      HAVING array_agg(cp.profile_id ORDER BY cp.profile_id)::text[] = $2::text[]
      LIMIT 1
    `,
      [sid, sorted],
    );

    const existingId = findRes.rows[0]?.id ? String(findRes.rows[0].id) : "";

    let conversationId = existingId;

    if (!conversationId) {
      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO conversations (scenario_id, title, avatar_url, created_at)
        VALUES ($1, $2, $3, NOW() AT TIME ZONE 'UTC')
        RETURNING id
      `,
        [sid, title || null, avatarUrl || null],
      );
      conversationId = String(ins.rows?.[0]?.id ?? "");
      if (!conversationId) {
        await client.query("ROLLBACK");
        return { error: "Create failed", status: 400 };
      }

      // Insert participants
      for (const pid of sorted) {
        await client.query(
          `
          INSERT INTO conversation_participants (conversation_id, profile_id, added_at)
          VALUES ($1, $2, NOW() AT TIME ZONE 'UTC')
          ON CONFLICT (conversation_id, profile_id) DO NOTHING
        `,
          [conversationId, pid],
        );
      }
    } else {
      // If existing conversation, enforce scenario access only (not profile ownership)
      const ok = await scenarioAccess(client, sid, uid);
      if (!ok) {
        await client.query("ROLLBACK");
        return { error: "Not allowed", status: 403 };
      }
    }

    const res = await client.query<ConversationRow>(
      `
      SELECT
        c.id,
        c.scenario_id,
        c.title,
        c.avatar_url,
        COALESCE(array_agg(cp.profile_id ORDER BY cp.profile_id) FILTER (WHERE cp.profile_id IS NOT NULL), '{}'::uuid[])::text[]
          AS participant_profile_ids,
        c.created_at,
        c.updated_at,
        c.last_message_at
      FROM conversations c
      LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
      LIMIT 1
    `,
      [conversationId],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    await client.query("COMMIT");

    // Emit conversation.created event for real-time subscribers
    try {
      realtimeService.emitScenarioEvent(sid, "conversation.created", { conversation: mapConversationRowToApi(row) });
    } catch (e) {
      console.log("realtime emit conversation.created failed", e);
    }

    try {
      websocketService.broadcastScenarioEvent(sid, "conversation.created", { conversation: mapConversationRowToApi(row) });
    } catch (e) {
      console.log("websocket emit conversation.created failed", e);
    }

    return { conversation: mapConversationRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("createConversation failed", e);
    return { error: "Create failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function updateConversationMeta(args: {
  conversationId: string;
  userId: string;
  title?: string | null;
  avatarUrl?: string | null;
}): Promise<{ conversation: ConversationApi } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!cid || !uid) return null;

  const title =
    args.title === undefined
      ? undefined
      : args.title === null
        ? null
        : (String(args.title).trim() || null);

  const avatarUrl =
    args.avatarUrl === undefined
      ? undefined
      : args.avatarUrl === null
        ? null
        : (String(args.avatarUrl).trim() || null);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await client.query<{ scenario_id: string }>("SELECT scenario_id FROM conversations WHERE id = $1 LIMIT 1", [cid]);
    const sid = String(ctx.rows?.[0]?.scenario_id ?? "");
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, cid, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    const sets: string[] = [];
    const params: unknown[] = [cid];
    let idx = 2;

    if (title !== undefined) {
      sets.push(`title = $${idx}`);
      params.push(title);
      idx++;
    }

    if (avatarUrl !== undefined) {
      sets.push(`avatar_url = $${idx}`);
      params.push(avatarUrl);
      idx++;
    }

    // Always bump updated_at when this endpoint is called.
    sets.push("updated_at = NOW() AT TIME ZONE 'UTC'");

    const res = await client.query<ConversationRow>(
      `
      UPDATE conversations
      SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING
        id,
        scenario_id,
        title,
        avatar_url,
        ARRAY(SELECT profile_id::text FROM conversation_participants WHERE conversation_id = $1 ORDER BY profile_id) AS participant_profile_ids,
        created_at,
        updated_at,
        last_message_at
    `,
      params,
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    await client.query("COMMIT");
    return { conversation: mapConversationRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("updateConversationMeta failed", e);
    return { error: "Update failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function uploadConversationAvatar(args: {
  conversationId: string;
  userId: string;
  file: Express.Multer.File;
}): Promise<{ conversation: ConversationApi; avatarUrl: string } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const file = args.file;
  if (!cid || !uid || !file) return null;

  const client = await pool.connect();
  let previousUrl = "";
  let uploadedUrl = "";
  try {
    await client.query("BEGIN");

    const ctx = await client.query<{ scenario_id: string; avatar_url: string | null }>(
      "SELECT scenario_id, avatar_url FROM conversations WHERE id = $1 LIMIT 1",
      [cid],
    );
    const sid = String(ctx.rows?.[0]?.scenario_id ?? "");
    previousUrl = ctx.rows?.[0]?.avatar_url != null ? String(ctx.rows[0].avatar_url) : "";
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, cid, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    uploadedUrl = await r2Service.uploadConversationAvatar(file, cid);

    const res = await client.query<ConversationRow>(
      `
      UPDATE conversations
      SET
        avatar_url = $2,
        updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $1
      RETURNING
        id,
        scenario_id,
        title,
        avatar_url,
        ARRAY(SELECT profile_id::text FROM conversation_participants WHERE conversation_id = $1 ORDER BY profile_id) AS participant_profile_ids,
        created_at,
        updated_at,
        last_message_at
    `,
      [cid, uploadedUrl],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    await client.query("COMMIT");

    // Best-effort cleanup of previous object (only if it was one of our public URLs).
    if (previousUrl && previousUrl !== uploadedUrl) {
      try {
        await r2Service.deleteByPublicUrl(previousUrl);
      } catch {
        // best-effort
      }
    }

    return { avatarUrl: uploadedUrl, conversation: mapConversationRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }

    // Best-effort cleanup of newly uploaded object if DB update failed after upload.
    if (uploadedUrl) {
      try {
        await r2Service.deleteByPublicUrl(uploadedUrl);
      } catch {
        // ignore
      }
    }

    console.error("uploadConversationAvatar failed", e);
    return { error: "Upload failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function updateConversationParticipants(args: {
  conversationId: string;
  userId: string;
  participantProfileIds: string[];
}): Promise<{ conversation: ConversationApi } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const ids = Array.from(new Set((args.participantProfileIds ?? []).map(String).map((s) => s.trim()).filter(Boolean)));

  if (!cid || !uid) return null;
  if (ids.length < 1) return { error: "participantProfileIds must have 1+ ids", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await client.query<{ scenario_id: string }>("SELECT scenario_id FROM conversations WHERE id = $1 LIMIT 1", [cid]);
    const sid = String(ctx.rows?.[0]?.scenario_id ?? "");
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, cid, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    // Must still own at least one participant profile in the updated set
    const owns = await client.query(
      `
        SELECT 1
        FROM profiles
        WHERE scenario_id = $1
          AND id = ANY($2::uuid[])
          AND owner_user_id = $3
        LIMIT 1
      `,
      [sid, ids, uid],
    );
    if (owns.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    const allInScenario = await validateProfilesInScenario(client, sid, ids);
    if (!allInScenario) {
      await client.query("ROLLBACK");
      return { error: "Participants must belong to scenario", status: 400 };
    }

    const sorted = ids.slice().sort();

    // Replace participant set
    await client.query("DELETE FROM conversation_participants WHERE conversation_id = $1", [cid]);

    for (const pid of sorted) {
      await client.query(
        `
        INSERT INTO conversation_participants (conversation_id, profile_id, added_at)
        VALUES ($1, $2, NOW() AT TIME ZONE 'UTC')
        ON CONFLICT (conversation_id, profile_id) DO NOTHING
      `,
        [cid, pid],
      );
    }

    await client.query("UPDATE conversations SET updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1", [cid]);

    const res = await client.query<ConversationRow>(
      `
      SELECT
        c.id,
        c.scenario_id,
        c.title,
        c.avatar_url,
        COALESCE(array_agg(cp.profile_id ORDER BY cp.profile_id) FILTER (WHERE cp.profile_id IS NOT NULL), '{}'::uuid[])::text[]
          AS participant_profile_ids,
        c.created_at,
        c.updated_at,
        c.last_message_at
      FROM conversations c
      LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
      LIMIT 1
    `,
      [cid],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    await client.query("COMMIT");
    return { conversation: mapConversationRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("updateConversationParticipants failed", e);
    return { error: "Update failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function deleteConversation(args: {
  conversationId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!cid || !uid) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await client.query<{ scenario_id: string }>("SELECT scenario_id FROM conversations WHERE id = $1 LIMIT 1", [cid]);
    const sid = String(ctx.rows?.[0]?.scenario_id ?? "");
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const isOwnerGm = await isScenarioOwnerOrGm(client, sid, uid);
    if (!isOwnerGm) {
      const canSee = await userOwnsAnyProfileInConversation(client, cid, uid);
      if (!canSee) {
        await client.query("ROLLBACK");
        return { error: "Not allowed", status: 403 };
      }
    }

    await client.query("DELETE FROM conversations WHERE id = $1", [cid]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("deleteConversation failed", e);
    return { error: "Delete failed", status: 400 };
  } finally {
    client.release();
  }
}