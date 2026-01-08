import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { LikeApi, LikeRow } from "./likeModels";
import { mapLikeRowToApi } from "./likeModels";
import type { PostApi, PostRow } from "../posts/postModels";
import { mapPostRowToApi } from "../posts/postModels";

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

export async function listLikesForScenario(args: { scenarioId: string; userId: string }): Promise<LikeApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<LikeRow>(
      `
      SELECT id, scenario_id, profile_id, post_id, created_at
      FROM likes
      WHERE scenario_id = $1
      ORDER BY created_at DESC, id DESC
    `,
      [sid],
    );

    return res.rows.map(mapLikeRowToApi);
  } catch (e: unknown) {
    // Most common failure: relation "likes" does not exist.
    return null;
  } finally {
    client.release();
  }
}

export async function setLikeState(args: {
  userId: string;
  scenarioId: string;
  profileId: string;
  postId: string;
  ensureLiked: boolean;
}): Promise<
  | { liked: boolean; like: LikeApi | null; post: PostApi }
  | { error: string; status: number }
  | null
> {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  const profileId = String(args.profileId ?? "").trim();
  const postId = String(args.postId ?? "").trim();
  const ensureLiked = Boolean(args.ensureLiked);
  if (!uid || !sid || !profileId || !postId) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const canActAs = await requireOwnedProfileInScenario(client, sid, uid, profileId);
    if (!canActAs) {
      await client.query("ROLLBACK");
      return { error: "Not allowed to like as that profile", status: 403 };
    }

    const postRes = await client.query<{ scenario_id: string }>(
      "SELECT scenario_id FROM posts WHERE id = $1 LIMIT 1",
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

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM likes WHERE scenario_id = $1 AND profile_id = $2 AND post_id = $3 LIMIT 1",
      [sid, profileId, postId],
    );

    const had = !!existing.rows[0];

    let like: LikeApi | null = null;

    if (ensureLiked) {
      if (!had) {
        const ins = await client.query<LikeRow>(
          `
            INSERT INTO likes (scenario_id, profile_id, post_id, created_at)
            VALUES ($1, $2, $3, NOW() AT TIME ZONE 'UTC')
            RETURNING id, scenario_id, profile_id, post_id, created_at
          `,
          [sid, profileId, postId],
        );

        like = ins.rows[0] ? mapLikeRowToApi(ins.rows[0]) : null;

        await client.query(
          "UPDATE posts SET like_count = like_count + 1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
          [postId],
        );
      }
    } else {
      if (had) {
        await client.query(
          "DELETE FROM likes WHERE scenario_id = $1 AND profile_id = $2 AND post_id = $3",
          [sid, profileId, postId],
        );

        await client.query(
          "UPDATE posts SET like_count = GREATEST(0, like_count - 1), updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
          [postId],
        );
      }
    }

    const postAfter = await client.query<PostRow>(
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
      WHERE id = $1
      LIMIT 1
    `,
      [postId],
    );

    const p0 = postAfter.rows[0];
    if (!p0) {
      await client.query("ROLLBACK");
      return { error: "Post not found", status: 404 };
    }

    await client.query("COMMIT");

    return { liked: ensureLiked ? true : false, like: ensureLiked ? (had ? null : like) : null, post: mapPostRowToApi(p0) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Set like failed", status: 400 };
  } finally {
    client.release();
  }
}
