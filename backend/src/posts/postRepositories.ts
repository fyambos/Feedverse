import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { PostApi, PostRow } from "./postModels";
import { mapPostRowToApi } from "./postModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { deleteRepostsForPostCascade } from "../reposts/repostRepositories";
import { extractMentionHandles } from "../lib/mentions";
import realtimeService from "../realtime/realtimeService";
import websocketService from "../realtime/websocketService";
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

async function requireOwnedProfileInScenario(client: PoolClient, scenarioId: string, userId: string, profileId: string) {
  const res = await client.query(
    `
    SELECT 1
    FROM profiles
    WHERE id = $1
      AND scenario_id = $2
      AND owner_user_id = $3
    LIMIT 1
  `,
    [profileId, scenarioId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function userCanActAsAuthor(client: PoolClient, scenarioId: string, userId: string, authorProfileId: string) {
  const res = await client.query(
    `
    SELECT id, owner_user_id, is_public
    FROM profiles
    WHERE id = $1
      AND scenario_id = $2
    LIMIT 1
  `,
    [authorProfileId, scenarioId],
  );

  const row = res.rows[0] as { id: string; owner_user_id: string | null; is_public: boolean | null } | undefined;
  if (!row) {
    // console.log("userCanActAsAuthor: profile not found", { authorProfileId, scenarioId, userId });
    return false;
  }

  const ownerMatches = String(row.owner_user_id ?? "") === String(userId ?? "");
  const isPublic = Boolean(row.is_public);
  if (ownerMatches) return true;
  if (isPublic) return true;
  // console.log("userCanActAsAuthor: denied", { authorProfileId, scenarioId, userId, is_public: row.is_public });
  return false;
}

export async function listPostsForScenario(args: {
  scenarioId: string;
  userId: string;
}): Promise<PostApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<PostRow>(
      `
      SELECT
        id,
        scenario_id,
        author_profile_id,
        text,
        image_urls,
        reply_count,
        repost_count,
        like_count,
        parent_post_id,
        quoted_post_id,
        inserted_at,
        created_at,
        post_type,
        meta,
        is_pinned,
        pin_order,
        updated_at
      FROM posts
      WHERE scenario_id = $1
      ORDER BY created_at ASC, id ASC
    `,
      [sid],
    );

    return res.rows.map(mapPostRowToApi);
  } finally {
    client.release();
  }
}

// Cursor is `${updatedAtIso}|${id}` using the post's updated_at timestamp.
export async function listPostsPageForScenario(args: {
  scenarioId: string;
  userId: string;
  limit: number;
  cursor?: string | null;
}): Promise<{ items: PostApi[]; nextCursor: string | null } | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const limit = Math.max(1, Math.min(500, Math.floor(Number(args.limit ?? 200))));
  const cursorRaw = args.cursor == null ? "" : String(args.cursor);
  if (!sid || !uid) return null;

  let cursorUpdatedAt: Date | null = null;
  let cursorId = "";
  if (cursorRaw.trim()) {
    const parts = cursorRaw.split("|");
    if (parts.length >= 2) {
      const t = parts[0] ? new Date(String(parts[0])) : null;
      const id = String(parts[1] ?? "").trim();
      if (t && !Number.isNaN(t.getTime()) && id) {
        cursorUpdatedAt = t;
        cursorId = id;
      }
    }
  }

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<PostRow>(
      `
      SELECT
        id,
        scenario_id,
        author_profile_id,
        text,
        image_urls,
        reply_count,
        repost_count,
        like_count,
        parent_post_id,
        quoted_post_id,
        inserted_at,
        created_at,
        post_type,
        meta,
        is_pinned,
        pin_order,
        updated_at
      FROM posts
      WHERE scenario_id = $1
        AND (
          $2::timestamptz IS NULL
          OR updated_at < $2
          OR (updated_at = $2 AND id < $3)
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT $4
    `,
      [sid, cursorUpdatedAt, cursorId, limit],
    );

    const items = res.rows.map(mapPostRowToApi);
    if (items.length === 0) return { items: [], nextCursor: null };

    let nextCursor: string | null = null;
    if (items.length === limit) {
      const last = res.rows[res.rows.length - 1] as any;
      const updatedAtIso = last?.updated_at ? new Date(last.updated_at).toISOString() : null;
      const id = String(last?.id ?? "").trim();
      if (updatedAtIso && id) nextCursor = `${updatedAtIso}|${id}`;
    }

    return { items, nextCursor };
  } finally {
    client.release();
  }
}

export async function createPostForScenario(args: {
  scenarioId: string;
  userId: string;
  input: {
    id?: string | null;
    authorProfileId: string;
    text: string;
    imageUrls?: string[] | null;
    replyCount?: number | null;
    repostCount?: number | null;
    likeCount?: number | null;
    parentPostId?: string | null;
    quotedPostId?: string | null;
    insertedAt?: string | null;
    createdAt?: string | null;
    postType?: string | null;
    isPinned?: boolean | null;
    pinOrder?: number | null;
    meta?: any;
  };
}): Promise<{ post: PostApi } | { error: string; status: number } | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const requestedId = args.input?.id != null ? String(args.input.id).trim() : "";
  const authorProfileId = String(args.input?.authorProfileId ?? "").trim();
  const text = String(args.input?.text ?? "");
  if (!authorProfileId) return { error: "authorProfileId is required", status: 400 };
  if (!text.trim()) return { error: "text is required", status: 400 };

  const imageUrls = Array.isArray(args.input?.imageUrls)
    ? args.input!.imageUrls!.map(String).filter(Boolean)
    : [];

  const parentPostId = args.input?.parentPostId ? String(args.input.parentPostId) : null;
  const quotedPostId = args.input?.quotedPostId ? String(args.input.quotedPostId) : null;

  const createdAt = args.input?.createdAt ? new Date(String(args.input.createdAt)) : new Date();
  const insertedAt = args.input?.insertedAt ? new Date(String(args.input.insertedAt)) : createdAt;

  const postType = String(args.input?.postType ?? "rp").trim() || "rp";
  const meta = args.input?.meta ?? null;

  const replyCount = Number.isFinite(Number(args.input?.replyCount)) ? Math.max(0, Math.floor(Number(args.input?.replyCount))) : 0;
  const repostCount = Number.isFinite(Number(args.input?.repostCount)) ? Math.max(0, Math.floor(Number(args.input?.repostCount))) : 0;
  const likeCount = Number.isFinite(Number(args.input?.likeCount)) ? Math.max(0, Math.floor(Number(args.input?.likeCount))) : 0;
  const isPinned = Boolean(args.input?.isPinned);
  const pinOrder = args.input?.pinOrder == null ? null : Math.floor(Number(args.input.pinOrder));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canPostAs = await userCanActAsAuthor(client, sid, uid, authorProfileId);
    if (!canPostAs) {
      await client.query("ROLLBACK");
      return { error: "Not allowed to post as that profile", status: 403 };
    }

    // If caller provided an id and it already exists, treat this as an update (upsert).
    // This keeps mobile UI stable: it generates ids client-side and calls upsertPost() for create/edit.
    let hadExistingId = false;
    if (requestedId) {
      const existing = await client.query<
        { scenario_id: string; author_profile_id: string; parent_post_id: string | null }
      >(
        "SELECT scenario_id, author_profile_id, parent_post_id FROM posts WHERE id = $1 LIMIT 1",
        [requestedId],
      );

      const row0 = existing.rows[0];
      if (row0) {
        hadExistingId = true;
        if (String(row0.scenario_id) !== sid) {
          await client.query("ROLLBACK");
          return { error: "id already exists in another scenario", status: 409 };
        }

        const canEdit = await userCanActAsAuthor(
          client,
          String(row0.scenario_id),
          uid,
          String(row0.author_profile_id),
        );
        if (!canEdit) {
          await client.query("ROLLBACK");
          return null;
        }
      }
    }

    // parent/quote (if provided) must be within scenario
    if (parentPostId) {
      const p = await client.query("SELECT 1 FROM posts WHERE id = $1 AND scenario_id = $2 LIMIT 1", [parentPostId, sid]);
      if (p.rowCount === 0) {
        await client.query("ROLLBACK");
        return { error: "parentPostId invalid", status: 400 };
      }
    }
    if (quotedPostId) {
      const q = await client.query("SELECT 1 FROM posts WHERE id = $1 AND scenario_id = $2 LIMIT 1", [quotedPostId, sid]);
      if (q.rowCount === 0) {
        await client.query("ROLLBACK");
        return { error: "quotedPostId invalid", status: 400 };
      }
    }

    const res = await client.query<PostRow>(
      `
      INSERT INTO posts (
        id,
        scenario_id,
        author_profile_id,
        text,
        image_urls,
        reply_count,
        repost_count,
        like_count,
        parent_post_id,
        quoted_post_id,
        inserted_at,
        created_at,
        post_type,
        meta,
        is_pinned,
        pin_order,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::text[],
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14::jsonb,
        $15,
        $16,
        NOW() AT TIME ZONE 'UTC'
      )
      ON CONFLICT (id) DO UPDATE
      SET
        text = EXCLUDED.text,
        image_urls = EXCLUDED.image_urls,
        reply_count = EXCLUDED.reply_count,
        repost_count = EXCLUDED.repost_count,
        like_count = EXCLUDED.like_count,
        parent_post_id = EXCLUDED.parent_post_id,
        quoted_post_id = EXCLUDED.quoted_post_id,
        inserted_at = EXCLUDED.inserted_at,
        created_at = EXCLUDED.created_at,
        post_type = EXCLUDED.post_type,
        meta = EXCLUDED.meta,
        is_pinned = EXCLUDED.is_pinned,
        pin_order = EXCLUDED.pin_order,
        updated_at = NOW() AT TIME ZONE 'UTC'
      RETURNING
        id,
        scenario_id,
        author_profile_id,
        text,
        image_urls,
        reply_count,
        repost_count,
        like_count,
        parent_post_id,
        quoted_post_id,
        inserted_at,
        created_at,
        post_type,
        meta,
        is_pinned,
        pin_order,
        updated_at
    `,
      [
        requestedId || `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sid,
        authorProfileId,
        text,
        imageUrls,
        replyCount,
        repostCount,
        likeCount,
        parentPostId,
        quotedPostId,
        insertedAt,
        createdAt,
        postType,
        meta,
        isPinned,
        pinOrder,
      ],
    );

    // best-effort: increment reply_count on parent only for new inserts.
    // (Do not attempt to detect parent changes on updates; keep logic minimal.)
    const isNewInsert = requestedId ? !hadExistingId : true;
    if (parentPostId && isNewInsert) {
      await client.query(
        "UPDATE posts SET reply_count = reply_count + 1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [parentPostId],
      );
    }

    await client.query("COMMIT");

    const row = res.rows[0];
    if (!row) return { error: "Insert failed", status: 500 };

    // Mention notifications (best-effort) for new posts/replies.
    if (isNewInsert && text.includes("@")) {
      const postId = String(row.id ?? "").trim();
      const mentionedHandles = extractMentionHandles(text);

      if (postId && mentionedHandles.length > 0) {
        (async () => {
          try {
            const client2 = await pool.connect();
            try {
              // Resolve mentioned handles to profile owners within this scenario.
              const resProfiles = await client2.query<{
                id: string;
                owner_user_id: string | null;
                handle: string | null;
              }>(
                `
                  SELECT id, owner_user_id, handle
                  FROM profiles
                  WHERE scenario_id = $1
                    AND LOWER(handle) = ANY($2::text[])
                `,
                [sid, mentionedHandles],
              );

              const ownerIds = new Set<string>();
              for (const r of resProfiles.rows) {
                const owner = String(r?.owner_user_id ?? "").trim();
                if (owner) ownerIds.add(owner);
              }

              if (ownerIds.size === 0) return;

              // Remove sender's owner (if sender profile is owned) so sender doesn't get a push.
              let senderOwner = "";
              try {
                const resSender = await client2.query<{
                  owner_user_id: string | null;
                  handle: string | null;
                  display_name: string | null;
                }>(
                  `SELECT owner_user_id, handle, display_name FROM profiles WHERE id = $1 LIMIT 1`,
                  [authorProfileId],
                );
                senderOwner = String(resSender.rows?.[0]?.owner_user_id ?? "").trim();
                if (senderOwner) ownerIds.delete(senderOwner);
              } catch {}

              if (ownerIds.size === 0) return;

              // Build push title/body.
              let senderLabel = "Someone";
              try {
                const resSender2 = await client2.query<{ handle: string | null; display_name: string | null }>(
                  `SELECT handle, display_name FROM profiles WHERE id = $1 LIMIT 1`,
                  [authorProfileId],
                );
                const h = String(resSender2.rows?.[0]?.handle ?? "").trim();
                const dn = String(resSender2.rows?.[0]?.display_name ?? "").trim();
                senderLabel = h ? `@${h}` : dn || senderLabel;
              } catch {}

              const title = `${senderLabel} mentioned you`;
              const body = String(text ?? "").trim();

              // Broadcast a realtime mention event so clients can display in-app/native notifications.
              // We intentionally include profile ids (not user ids) so clients can decide if they own
              // the mentioned profile(s) without leaking extra user identifiers.
              try {
                const mentionedProfileIds = resProfiles.rows
                  .filter((r) => {
                    const owner = String(r?.owner_user_id ?? "").trim();
                    if (!owner) return false;
                    if (!ownerIds.has(owner)) return false;
                    if (senderOwner && owner === senderOwner) return false;
                    return true;
                  })
                  .map((r) => String(r.id ?? "").trim())
                  .filter(Boolean);

                if (mentionedProfileIds.length > 0) {
                  const payload = {
                    scenarioId: sid,
                    postId,
                    authorProfileId,
                    mentionedProfileIds,
                    title,
                    body: body ? (body.length > 140 ? body.slice(0, 137) + "…" : body) : undefined,
                    mentionedHandles,
                  };
                  realtimeService.emitScenarioEvent(sid, "mention.created", payload);
                  websocketService.broadcastScenarioEvent(sid, "mention.created", payload);
                }
              } catch {
                // ignore realtime failures
              }

              // Expo push token send (works with expo-notifications in EAS builds).
              try {
                const repo = new UserRepository();
                const tokenRows = await repo.listExpoPushTokensForUserIds(Array.from(ownerIds));
                const expoMessages = tokenRows
                  .map((r) => String((r as any)?.expo_push_token ?? (r as any)?.expoPushToken ?? "").trim())
                  .filter(Boolean)
                  .map((to) => ({
                    to,
                    title,
                    body: body || undefined,
                    data: {
                      scenarioId: sid,
                      postId,
                      kind: "mention",
                      authorProfileId,
                    },
                  }));

                await sendExpoPush(expoMessages);
              } catch (e: any) {
                console.warn("Expo push send failed", e?.message ?? e);
              }
            } finally {
              client2.release();
            }
          } catch (e) {
            console.warn("Error while attempting mention push send:", (e as Error)?.message ?? e);
          }
        })();
      }
    }

    return { post: mapPostRowToApi(row) };
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

export async function updatePost(args: {
  postId: string;
  userId: string;
  patch: Record<string, any>;
}): Promise<{ post: PostApi } | { error: string; status: number } | null> {
  const pid = String(args.postId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const patch = args.patch ?? {};

  const allowed: Array<[string, string, (v: any) => any]> = [
    ["text", "text", (v) => String(v ?? "")],
    ["imageUrls", "image_urls", (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])],
    ["postType", "post_type", (v) => String(v ?? "rp")],
    ["meta", "meta", (v) => (v === undefined ? null : v)],
    ["replyCount", "reply_count", (v) => Math.max(0, Math.floor(Number(v ?? 0)))],
    ["repostCount", "repost_count", (v) => Math.max(0, Math.floor(Number(v ?? 0)))],
    ["likeCount", "like_count", (v) => Math.max(0, Math.floor(Number(v ?? 0)))],
    ["isPinned", "is_pinned", (v) => Boolean(v)],
    ["pinOrder", "pin_order", (v) => (v == null ? null : Math.floor(Number(v)))],
    ["createdAt", "created_at", (v) => new Date(String(v ?? new Date().toISOString()))],
    ["insertedAt", "inserted_at", (v) => new Date(String(v ?? new Date().toISOString()))],
  ];

  const setParts: string[] = [];
  const values: any[] = [];

  for (const [k, col, cast] of allowed) {
    if (!(k in patch)) continue;
    const v = cast((patch as any)[k]);

    if (col === "text" && !String(v).trim()) continue;

    values.push(v);
    if (col === "image_urls") {
      setParts.push(`${col} = $${values.length}::text[]`);
    } else if (col === "meta") {
      setParts.push(`${col} = $${values.length}::jsonb`);
    } else if (col === "created_at" || col === "inserted_at") {
      setParts.push(`${col} = $${values.length}::timestamptz`);
    } else {
      setParts.push(`${col} = $${values.length}`);
    }
  }

  if (setParts.length === 0) return { error: "No valid fields to update", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch + access: you can edit only if you own the author profile.
    const existing = await client.query<
      { scenario_id: string; author_profile_id: string }
    >(
      "SELECT scenario_id, author_profile_id FROM posts WHERE id = $1 LIMIT 1",
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Post not found", status: 404 };
    }

    const canEdit = await userCanActAsAuthor(client, String(row0.scenario_id), uid, String(row0.author_profile_id));
    if (!canEdit) {
      await client.query("ROLLBACK");
      return null;
    }

    const sql = `
      UPDATE posts
      SET ${setParts.join(", ")}, updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $${values.length + 1}
      RETURNING
        id,
        scenario_id,
        author_profile_id,
        text,
        image_urls,
        reply_count,
        repost_count,
        like_count,
        parent_post_id,
        quoted_post_id,
        inserted_at,
        created_at,
        post_type,
        meta,
        is_pinned,
        pin_order,
        updated_at
    `;

    const res = await client.query<PostRow>(sql, [...values, pid]);
    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Update failed", status: 400 };
    }

    await client.query("COMMIT");
    return { post: mapPostRowToApi(row) };
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

export async function uploadPostImages(args: {
  postId: string;
  userId: string;
  files: Express.Multer.File[];
}): Promise<{ post: PostApi } | { error: string; status: number } | null> {
  const pid = String(args.postId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  const files = Array.isArray(args.files) ? args.files : [];
  if (!pid || !uid) return null;
  if (files.length === 0) return { error: "No files uploaded", status: 400 };

  const client = await pool.connect();
  let uploadedUrls: string[] = [];

  try {
    await client.query("BEGIN");

    // Fetch + access: you can upload images only if you own the author profile.
    const existing = await client.query<{
      scenario_id: string;
      author_profile_id: string;
    }>(
      "SELECT scenario_id, author_profile_id FROM posts WHERE id = $1 LIMIT 1",
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Post not found", status: 404 };
    }

    const canEdit = await userCanActAsAuthor(
      client,
      String(row0.scenario_id),
      uid,
      String(row0.author_profile_id),
    );
    if (!canEdit) {
      await client.query("ROLLBACK");
      return null;
    }

    // Upload to R2 first (so we only write URLs that exist).
    uploadedUrls = await Promise.all(files.map((f, i) => r2Service.uploadPostImage(f, pid, i)));

    const res = await client.query<PostRow>(
      `
        UPDATE posts
        SET
          image_urls = COALESCE(image_urls, '{}'::text[]) || $1::text[],
          updated_at = NOW() AT TIME ZONE 'UTC'
        WHERE id = $2
        RETURNING
          id,
          scenario_id,
          author_profile_id,
          text,
          image_urls,
          reply_count,
          repost_count,
          like_count,
          parent_post_id,
          quoted_post_id,
          inserted_at,
          created_at,
          post_type,
          meta,
          is_pinned,
          pin_order,
          updated_at
      `,
      [uploadedUrls, pid],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Update failed", status: 400 };
    }

    await client.query("COMMIT");
    return { post: mapPostRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }

    // Best-effort cleanup: if DB update fails after upload, delete uploaded objects.
    try {
      await Promise.all(
        (uploadedUrls ?? []).map((url) => r2Service.deleteByPublicUrl(String(url)).catch(() => false)),
      );
    } catch {
      // ignore
    }

    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Upload failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function deletePost(args: {
  postId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number } | null> {
  const pid = String(args.postId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const client = await pool.connect();
  let urlsToDelete: string[] = [];
  try {
    await client.query("BEGIN");

    const existing = await client.query<
      { scenario_id: string; author_profile_id: string; parent_post_id: string | null }
    >(
      "SELECT scenario_id, author_profile_id, parent_post_id FROM posts WHERE id = $1 LIMIT 1",
      [pid],
    );

    const row0 = existing.rows[0];
    if (!row0) {
      await client.query("ROLLBACK");
      return { error: "Post not found", status: 404 };
    }

    const canDelete = await userCanActAsAuthor(client, String(row0.scenario_id), uid, String(row0.author_profile_id));
    if (!canDelete) {
      await client.query("ROLLBACK");
      return null;
    }

    // Collect image urls from this post + its direct replies so we can delete from R2.
    // (Best-effort; we don't try to recursively walk deep threads.)
    const imgs = await client.query<{ id: string; image_urls: string[] | null }>(
      "SELECT id, image_urls FROM posts WHERE id = $1 OR parent_post_id = $1",
      [pid],
    );
    urlsToDelete = imgs.rows
      .flatMap((r) => (Array.isArray(r.image_urls) ? r.image_urls : []))
      .map(String)
      .filter(Boolean);

    // Cascade deletes (best-effort if tables exist)
    await client.query("DELETE FROM likes WHERE post_id = $1", [pid]).catch(() => {});
    await deleteRepostsForPostCascade({ client, postId: pid });

    // Delete replies first so we don't leave orphaned threads.
    await client.query("DELETE FROM posts WHERE parent_post_id = $1", [pid]).catch(() => {});

    const del = await client.query("DELETE FROM posts WHERE id = $1", [pid]);
    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "Delete failed", status: 400 };
    }

    // Decrement reply_count on parent if this was a reply
    if (row0.parent_post_id) {
      await client.query(
        "UPDATE posts SET reply_count = GREATEST(0, reply_count - 1), updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [row0.parent_post_id],
      );
    }

    await client.query("COMMIT");

    // Best-effort: delete objects from R2 after DB delete succeeded.
    if (urlsToDelete.length > 0) {
      await Promise.all(urlsToDelete.map((u) => r2Service.deleteByPublicUrl(u).catch(() => false)));
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
