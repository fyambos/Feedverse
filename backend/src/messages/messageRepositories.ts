// backend/src/messages/messageRepositories.ts

// Mark all messages in a conversation as read for a profile
export async function markConversationMessagesRead(conversationId: string, profileId: string) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO message_reads (message_id, profile_id, read_at)
      SELECT m.id, $2, now()
      FROM messages m
      WHERE m.conversation_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.profile_id = $2
        )
    `, [conversationId, profileId]);
  } finally {
    client.release();
  }
}

// Get unread counts per conversation for a profile in a scenario
export async function getUnreadCountsForProfile(scenarioId: string, profileId: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT m.conversation_id, COUNT(*) AS unread_count
      FROM messages m
      LEFT JOIN message_reads r ON r.message_id = m.id AND r.profile_id = $2
      WHERE m.scenario_id = $1 AND r.id IS NULL
      GROUP BY m.conversation_id
    `, [scenarioId, profileId]);
    return res.rows; // [{ conversation_id, unread_count }]
  } finally {
    client.release();
  }
}
import type { PoolClient } from "pg";
import { pool } from "../config/database";
import { r2Service } from "../config/cloudflare/r2Service";
import type { MessageApi, MessageRow } from "./messageModels";
import { mapMessageRowToApi } from "./messageModels";
import realtimeService from "../realtime/realtimeService";
import websocketService from "../realtime/websocketService";
import { getMessaging } from "../config/firebaseAdmin";
import { sendExpoPush } from "../push/expoPush";
import { UserRepository } from "../users/userRepositories";

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
      AND (p.owner_user_id = $2 OR p.is_public = true)
    LIMIT 1
  `,
    [conversationId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function userCanActAsSender(client: PoolClient, scenarioId: string, userId: string, senderProfileId: string): Promise<boolean> {
  // Fetch the profile row so we can log helpful debug information when access is denied.
  const resRow = await client.query<{
    id: string;
    owner_user_id: string | null;
    is_public: boolean | null;
    is_private: boolean | null;
    scenario_id: string | null;
  }>(
    `
    SELECT id, owner_user_id, is_public, is_private, scenario_id
    FROM profiles
    WHERE id = $1
      AND scenario_id = $2
    LIMIT 1
  `,
    [senderProfileId, scenarioId],
  );

  const profile = resRow.rows?.[0];
  if (!profile) {
    // console.log("userCanActAsSender: profile not found", { senderProfileId, scenarioId, userId });
    return false;
  }

  const ownerMatches = String(profile.owner_user_id ?? "") === String(userId ?? "");
  const isPublic = Boolean(profile.is_public);

  const allowed = ownerMatches || isPublic === true;
  /* 
  if (!allowed) {
    console.log("userCanActAsSender: denied", {
      senderProfileId: profile.id,
      scenarioId: profile.scenario_id,
      owner_user_id: profile.owner_user_id,
      is_public: profile.is_public,
      requestUserId: userId,
    });
  }
  */

  return allowed;
}

async function getConversationScenarioId(client: PoolClient, conversationId: string): Promise<string> {
  const res = await client.query<{ scenario_id: string }>("SELECT scenario_id FROM conversations WHERE id = $1 LIMIT 1", [conversationId]);
  return String(res.rows?.[0]?.scenario_id ?? "");
}

export async function listMessages(args: {
  conversationId: string;
  userId: string;
  selectedProfileId?: string;
  limit?: number;
  beforeCreatedAt?: string;
}): Promise<{ messages: MessageApi[] } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!cid || !uid) return null;

  const limit = Math.max(1, Math.min(200, Number.isFinite(args.limit as any) ? Number(args.limit) : 100));
  const before = args.beforeCreatedAt ? String(args.beforeCreatedAt) : "";
  const beforeDate = before ? new Date(before) : null;

  const client = await pool.connect();
  try {
    const sid = await getConversationScenarioId(client, cid);
    if (!sid) return null;

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    let canSee = await userOwnsAnyProfileInConversation(client, cid, uid);

    // If the requester doesn't own any profile in the conversation, allow
    // viewing when a `selectedProfileId` is provided and that profile is
    // participating in the conversation and is either public or owned by
    // the requester.
    if (!canSee && args.selectedProfileId) {
      const sel = String(args.selectedProfileId ?? "").trim();
      if (sel) {
        const prow = await client.query(`SELECT owner_user_id, is_public, scenario_id FROM profiles WHERE id = $1 LIMIT 1`, [sel]);
        const p = prow.rows?.[0];
        if (p && String(p.scenario_id ?? "") === sid) {
          const part = await client.query(`SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND profile_id = $2 LIMIT 1`, [cid, sel]);
          if ((part.rowCount ?? 0) > 0) {
            const ownerMatches = String(p.owner_user_id ?? "") === uid;
            const isPublic = Boolean(p.is_public);
            if (ownerMatches || isPublic) {
              canSee = true;
            }
          }
        }
      }
    }

    if (!canSee) return null;

    const res = await client.query<MessageRow>(
      `
      SELECT
        id,
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        image_urls,
        created_at,
        updated_at,
        edited_at
      FROM messages
      WHERE conversation_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `,
      [cid, beforeDate ? beforeDate.toISOString() : null, limit],
    );

    // Reverse to oldest->newest for easier client rendering.
    const messages = res.rows.map(mapMessageRowToApi).reverse();
    return { messages };
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export async function sendMessage(args: {
  conversationId: string;
  userId: string;
  senderProfileId: string;
  text: string;
  kind?: string;
}): Promise<{ message: MessageApi } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const senderProfileId = String(args.senderProfileId ?? "").trim();
  const text = String(args.text ?? "");
  const kind = String(args.kind ?? "text").trim() || "text";

  if (!cid || !uid || !senderProfileId) return null;
  if (!text.trim()) return { error: "Text is required", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sid = await getConversationScenarioId(client, cid);
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Conversation not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    // Ownership check removed: allow any scenario player to send as any profile in the conversation

    // Sender must be a participant.
    const part = await client.query(
      `
      SELECT 1
      FROM conversation_participants
      WHERE conversation_id = $1
        AND profile_id = $2
      LIMIT 1
    `,
      [cid, senderProfileId],
    );
    if (part.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "Sender must be a participant", status: 400 };
    }

    const canAct = await userCanActAsSender(client, sid, uid, senderProfileId);
    if (!canAct) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    const res = await client.query<MessageRow>(
      `
      INSERT INTO messages (
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW() AT TIME ZONE 'UTC')
      RETURNING
        id,
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        image_urls,
        created_at,
        updated_at,
        edited_at
    `,
      [sid, cid, senderProfileId, text, kind],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Send failed", status: 400 };
    }

    await client.query("COMMIT");

    // Emit message.created for realtime subscribers
    try {
      const payload = { message: mapMessageRowToApi(row), senderUserId: uid };
      realtimeService.emitScenarioEvent(sid, "message.created", payload);
    } catch (e) {
      // console.log("realtime emit message.created failed", e);
    }

    try {
      const payload = { message: mapMessageRowToApi(row), senderUserId: uid };
      websocketService.broadcastScenarioEvent(sid, "message.created", payload);
    } catch (e) {
      // console.log("websocket emit message.created failed", e);
    }

    // Attempt to send push notifications to conversation participants' owners.
    // Important: include scenarioId + conversationId + a recipient-owned profileId in payload data
    // so mobile deep-linking doesn't lose context.
    (async () => {
      try {
        const client2 = await pool.connect();
        try {
          const parts = await client2.query(
            `SELECT p.owner_user_id AS owner_user_id, p.id AS profile_id
             FROM conversation_participants cp
             JOIN profiles p ON p.id = cp.profile_id
             WHERE cp.conversation_id = $1`,
            [cid],
          );

          const ownerToProfileIds = new Map<string, string[]>();
          const ownerIds = new Set<string>();
          for (const r of parts.rows) {
            const owner = String(r?.owner_user_id ?? "").trim();
            const pid = String(r?.profile_id ?? "").trim();
            if (!owner) continue;
            ownerIds.add(owner);
            if (!ownerToProfileIds.has(owner)) ownerToProfileIds.set(owner, []);
            if (pid) ownerToProfileIds.get(owner)!.push(pid);
          }

          // Remove sender's owner (if sender profile is owned) so sender doesn't get a push.
          try {
            const resSender = await client2.query(`SELECT owner_user_id FROM profiles WHERE id = $1 LIMIT 1`, [senderProfileId]);
            const senderOwner = String(resSender.rows?.[0]?.owner_user_id ?? "").trim();
            if (senderOwner) {
              ownerIds.delete(senderOwner);
              ownerToProfileIds.delete(senderOwner);
            }
          } catch {}

          if (ownerIds.size === 0) return;

          // Build notification payload
          const title = (await client2.query(`SELECT display_name FROM profiles WHERE id = $1 LIMIT 1`, [senderProfileId])).rows?.[0]?.display_name ?? "New message";
          const body = String(row.text ?? "");

          // FCM topic send (optional; requires client-side topic subscription).
          const messaging = getMessaging();
          if (messaging) {
            // For each owner, send to topic `user_<ownerId>`; clients should subscribe to this topic.
            const promises: Promise<any>[] = [];
            for (const ownerId of Array.from(ownerIds)) {
              const topic = `user_${ownerId}`;
              const profileId = String(ownerToProfileIds.get(ownerId)?.[0] ?? "").trim();
              const msg: any = {
                topic,
                notification: { title: String(title ?? "New message"), body: body ?? undefined },
                data: { conversationId: cid, scenarioId: sid, profileId },
              };
              promises.push(messaging.send(msg).catch((err: any) => {
                console.warn("FCM send to topic failed", topic, err?.message ?? err);
              }));
            }

            await Promise.all(promises);
          }

          // Expo push token send (works with expo-notifications in EAS builds; delivers when app is closed).
          try {
            const repo = new UserRepository();
            const tokenRows = await repo.listExpoPushTokensForUserIds(Array.from(ownerIds));

            const expoMessages = tokenRows
              .map((r) => {
                const ownerId = String((r as any)?.user_id ?? "").trim();
                const to = String((r as any)?.expo_push_token ?? "").trim();
                const profileId = String(ownerToProfileIds.get(ownerId)?.[0] ?? "").trim();
                return {
                  to,
                  title: String(title ?? "New message"),
                  body: body || undefined,
                  data: { conversationId: cid, scenarioId: sid, profileId, kind: "message" },
                };
              })
              .filter((m) => Boolean(m.to));

            await sendExpoPush(expoMessages);
          } catch (e: any) {
            console.warn("Expo push send failed", e?.message ?? e);
          }
        } finally {
          client2.release();
        }
      } catch (e) {
        console.warn("Error while attempting server-side push send:", (e as Error)?.message ?? e);
      }
    })();

    return { message: mapMessageRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Send failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function sendMessageWithImages(args: {
  conversationId: string;
  userId: string;
  senderProfileId: string;
  text?: string;
  files: Express.Multer.File[];
  kind?: string;
}): Promise<{ message: MessageApi } | { error: string; status: number } | null> {
  const cid = String(args.conversationId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const senderProfileId = String(args.senderProfileId ?? "").trim();
  const text = String(args.text ?? "");
  const files = Array.isArray(args.files) ? args.files : [];

  if (!cid || !uid || !senderProfileId) return null;
  if (files.length === 0) {
    // Fall back to regular send behavior.
    return await sendMessage({ conversationId: cid, userId: uid, senderProfileId, text });
  }

  if (!text.trim() && files.length === 0) return { error: "Text or images required", status: 400 };
  if (files.length > 8) return { error: "Too many images", status: 400 };

  const client = await pool.connect();
  let uploadedUrls: string[] = [];
  try {
    await client.query("BEGIN");

    const sid = await getConversationScenarioId(client, cid);
    if (!sid) {
      await client.query("ROLLBACK");
      return { error: "Conversation not found", status: 404 };
    }

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, cid, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return null;
    }

    const part = await client.query(
      `
      SELECT 1
      FROM conversation_participants
      WHERE conversation_id = $1
        AND profile_id = $2
      LIMIT 1
    `,
      [cid, senderProfileId],
    );
    if (part.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "Sender must be a participant", status: 400 };
    }

    const canAct = await userCanActAsSender(client, sid, uid, senderProfileId);
    if (!canAct) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    // Create message first so we can key R2 objects by messageId.
    const created = await client.query<MessageRow>(
      `
      INSERT INTO messages (
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW() AT TIME ZONE 'UTC')
      RETURNING
        id,
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        image_urls,
        created_at,
        updated_at,
        edited_at
    `,
      [sid, cid, senderProfileId, text.trim() ? text : "", String(args.kind ?? "text")],
    );

    const row0 = created.rows[0];
    const messageId = String(row0?.id ?? "").trim();
    if (!messageId) {
      await client.query("ROLLBACK");
      return { error: "Send failed", status: 400 };
    }

    // Upload to R2 (best effort cleanup on failure).
    uploadedUrls = await Promise.all(files.map((f, i) => r2Service.uploadMessageImage(f, messageId, i)));

    const updated = await client.query<MessageRow>(
      `
      UPDATE messages
      SET
        image_urls = $2::text[],
        updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $1
      RETURNING
        id,
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        image_urls,
        created_at,
        updated_at,
        edited_at
    `,
      [messageId, uploadedUrls],
    );

    const row = updated.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Send failed", status: 400 };
    }

    await client.query("COMMIT");

    // Emit message.created for realtime subscribers
    try {
      const payload = { message: mapMessageRowToApi(row), senderUserId: uid };
      realtimeService.emitScenarioEvent(sid, "message.created", payload);
    } catch {}

    try {
      const payload = { message: mapMessageRowToApi(row), senderUserId: uid };
      websocketService.broadcastScenarioEvent(sid, "message.created", payload);
    } catch {}

    // Best-effort push notifications (FCM + Expo).
    (async () => {
      try {
        const client2 = await pool.connect();
        try {
          const parts = await client2.query(
            `SELECT p.owner_user_id AS owner_user_id, p.id AS profile_id
             FROM conversation_participants cp
             JOIN profiles p ON p.id = cp.profile_id
             WHERE cp.conversation_id = $1`,
            [cid],
          );

          const ownerToProfileIds = new Map<string, string[]>();
          const ownerIds = new Set<string>();
          for (const r of parts.rows) {
            const owner = String(r?.owner_user_id ?? "").trim();
            const pid = String(r?.profile_id ?? "").trim();
            if (!owner) continue;
            ownerIds.add(owner);
            if (!ownerToProfileIds.has(owner)) ownerToProfileIds.set(owner, []);
            if (pid) ownerToProfileIds.get(owner)!.push(pid);
          }

          // Remove sender's owner (if sender profile is owned).
          try {
            const resSender = await client2.query(`SELECT owner_user_id FROM profiles WHERE id = $1 LIMIT 1`, [senderProfileId]);
            const senderOwner = String(resSender.rows?.[0]?.owner_user_id ?? "").trim();
            if (senderOwner) {
              ownerIds.delete(senderOwner);
              ownerToProfileIds.delete(senderOwner);
            }
          } catch {}

          if (ownerIds.size === 0) return;

          const title = (await client2.query(`SELECT display_name FROM profiles WHERE id = $1 LIMIT 1`, [senderProfileId])).rows?.[0]?.display_name ?? "New message";
          const body = (String((row as any).text ?? "").trim() || (Array.isArray((row as any).image_urls) && (row as any).image_urls.length > 0 ? "Sent an image" : "New message"));

          const messaging = getMessaging();
          if (messaging) {
            const promises: Promise<any>[] = [];
            for (const ownerId of Array.from(ownerIds)) {
              const topic = `user_${ownerId}`;
              const profileId = String(ownerToProfileIds.get(ownerId)?.[0] ?? "").trim();
              const msg: any = {
                topic,
                notification: { title: String(title ?? "New message"), body: body ?? undefined },
                data: { conversationId: cid, scenarioId: sid, profileId },
              };
              promises.push(messaging.send(msg).catch((err: any) => {
                console.warn("FCM send to topic failed", topic, err?.message ?? err);
              }));
            }
            await Promise.all(promises);
          }

          try {
            const repo = new UserRepository();
            const tokenRows = await repo.listExpoPushTokensForUserIds(Array.from(ownerIds));
            const expoMessages = tokenRows
              .map((r) => {
                const ownerId = String((r as any)?.user_id ?? "").trim();
                const to = String((r as any)?.expo_push_token ?? "").trim();
                const profileId = String(ownerToProfileIds.get(ownerId)?.[0] ?? "").trim();
                return {
                  to,
                  title: String(title ?? "New message"),
                  body: body || undefined,
                  data: { conversationId: cid, scenarioId: sid, profileId, kind: "message" },
                };
              })
              .filter((m) => Boolean(m.to));

            await sendExpoPush(expoMessages);
          } catch (e: any) {
            console.warn("Expo push send failed", e?.message ?? e);
          }
        } finally {
          client2.release();
        }
      } catch (e) {
        console.warn("Error while attempting server-side push send:", (e as Error)?.message ?? e);
      }
    })();

    return { message: mapMessageRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }

    if (uploadedUrls.length > 0) {
      await Promise.all(uploadedUrls.map((u) => r2Service.deleteByPublicUrl(String(u)).catch(() => false)));
    }

    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Send failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function updateMessage(args: {
  messageId: string;
  userId: string;
  text: string;
  senderProfileId?: string;
}): Promise<{ message: MessageApi } | { error: string; status: number } | null> {
  const mid = String(args.messageId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const text = String(args.text ?? "");
  const nextSenderProfileId = args.senderProfileId != null ? String(args.senderProfileId).trim() : "";

  if (!mid || !uid) return null;
  if (!text.trim()) return { error: "Text is required", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // console.log("updateMessage: attempt", { messageId: mid, userId: uid, textLength: text.length, nextSenderProfileId });

    const ctx = await client.query<{
      scenario_id: string;
      conversation_id: string;
      sender_profile_id: string;
    }>(
      `
      SELECT scenario_id, conversation_id, sender_profile_id
      FROM messages
      WHERE id = $1
      LIMIT 1
    `,
      [mid],
    );

    const scenarioId = String(ctx.rows?.[0]?.scenario_id ?? "");
    const conversationId = String(ctx.rows?.[0]?.conversation_id ?? "");
    const senderProfileId = String(ctx.rows?.[0]?.sender_profile_id ?? "");

    if (!scenarioId || !conversationId || !senderProfileId) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, scenarioId, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, conversationId, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return null;
    }

    // Optionally allow changing senderProfileId (used by mobile "send as" edit UX).
    // Must remain a participant and must be a profile the user can act as.
    let finalSender = senderProfileId;
    if (nextSenderProfileId) {
      const part = await client.query(
        `
        SELECT 1
        FROM conversation_participants
        WHERE conversation_id = $1
          AND profile_id = $2
        LIMIT 1
      `,
        [conversationId, nextSenderProfileId],
      );
      if (part.rowCount === 0) {
        await client.query("ROLLBACK");
        return { error: "Sender must be a participant", status: 400 };
      }

      const canAct = await userCanActAsSender(client, scenarioId, uid, nextSenderProfileId);
      if (!canAct) {
        // console.log(" denied next sender", { messageId: mid, nextSenderProfileId, requestUserId: uid });
        await client.query("ROLLBACK");
        return { error: "Not allowed", status: 403 };
      }

      finalSender = nextSenderProfileId;
    }

    // If the requester did not supply a next sender, ensure they can act as the
    // original sender; otherwise deny.
    if (!nextSenderProfileId) {
      const canActOriginal = await userCanActAsSender(client, scenarioId, uid, senderProfileId);
      if (!canActOriginal) {
        await client.query("ROLLBACK");
        return { error: "Not allowed", status: 403 };
      }
    }

    const res = await client.query<MessageRow>(
      `
      UPDATE messages
      SET
        text = $2,
        sender_profile_id = $3,
        updated_at = NOW() AT TIME ZONE 'UTC',
        edited_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $1
      RETURNING
        id,
        scenario_id,
        conversation_id,
        sender_profile_id,
        text,
        kind,
        image_urls,
        created_at,
        updated_at,
        edited_at
    `,
      [mid, text, finalSender],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    await client.query("COMMIT");
    // console.log("updateMessage: success", { messageId: mid, userId: uid, senderProfileId: finalSender });
    return { message: mapMessageRowToApi(row) };
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

export async function deleteMessage(args: {
  messageId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number } | null> {
  const mid = String(args.messageId ?? "").trim();
  const uid = String(args.userId ?? "").trim();

  if (!mid || !uid) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await client.query<{
      scenario_id: string;
      conversation_id: string;
      sender_profile_id: string;
      image_urls: string[] | null;
    }>(
      `
      SELECT scenario_id, conversation_id, sender_profile_id, image_urls
      FROM messages
      WHERE id = $1
      LIMIT 1
    `,
      [mid],
    );

    const scenarioId = String(ctx.rows?.[0]?.scenario_id ?? "");
    const conversationId = String(ctx.rows?.[0]?.conversation_id ?? "");
    const senderProfileId = String(ctx.rows?.[0]?.sender_profile_id ?? "");
    const imageUrls = Array.isArray(ctx.rows?.[0]?.image_urls) ? (ctx.rows?.[0]?.image_urls ?? []).map(String).filter(Boolean) : [];

    if (!scenarioId || !conversationId || !senderProfileId) {
      await client.query("ROLLBACK");
      return { error: "Not found", status: 404 };
    }

    const ok = await scenarioAccess(client, scenarioId, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canSee = await userOwnsAnyProfileInConversation(client, conversationId, uid);
    if (!canSee) {
      await client.query("ROLLBACK");
      return null;
    }

    // Only the owner of sender profile can delete.
    const canAct = await userCanActAsSender(client, scenarioId, uid, senderProfileId);
    if (!canAct) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    await client.query("DELETE FROM messages WHERE id = $1", [mid]);

    await client.query("COMMIT");

    // Best-effort cleanup of images in R2.
    if (imageUrls.length > 0) {
      await Promise.all(imageUrls.map((u) => r2Service.deleteByPublicUrl(String(u)).catch(() => false)));
    }

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
