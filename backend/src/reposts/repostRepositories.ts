import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { RepostApi, RepostRow } from "./repostModels";
import { mapRepostRowToApi } from "./repostModels";
import type { PostApi, PostRow } from "../posts/postModels";
import { mapPostRowToApi } from "../posts/postModels";
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
  // NOTE: despite the name, we intentionally allow acting as ANY profile in the scenario.
  // In Feedverse, users can like/repost as any scenario profile.
  const res = await client.query(
    `
    SELECT 1
    FROM profiles
    WHERE id = $1
      AND scenario_id = $2
    LIMIT 1
  `,
    [profileId, scenarioId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listRepostsForScenario(args: {
  scenarioId: string;
  userId: string;
}): Promise<RepostApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<RepostRow>(
      `
      SELECT id, scenario_id, profile_id, post_id, created_at
      FROM reposts
      WHERE scenario_id = $1
      ORDER BY created_at DESC, id DESC
    `,
      [sid],
    );

    return res.rows.map(mapRepostRowToApi);
  } finally {
    client.release();
  }
}

export async function toggleRepost(args: {
  userId: string;
  scenarioId: string;
  profileId: string;
  postId: string;
}): Promise<
  | { reposted: boolean; repost: RepostApi | null; post: PostApi }
  | { error: string; status: number }
  | null
> {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  const profileId = String(args.profileId ?? "").trim();
  const postId = String(args.postId ?? "").trim();
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
      return { error: "Not allowed to repost as that profile", status: 403 };
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
      "SELECT id FROM reposts WHERE profile_id = $1 AND post_id = $2 LIMIT 1",
      [profileId, postId],
    );

    const had = !!existing.rows[0];
    const id = `${profileId}|${postId}`;

    let repost: RepostApi | null = null;

    if (had) {
      await client.query("DELETE FROM reposts WHERE profile_id = $1 AND post_id = $2", [profileId, postId]);
      await client.query(
        "UPDATE posts SET repost_count = GREATEST(0, repost_count - 1), updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [postId],
      );
    } else {
      const ins = await client.query<RepostRow>(
        `
          INSERT INTO reposts (id, scenario_id, profile_id, post_id, created_at)
          VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC')
          ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at
          RETURNING id, scenario_id, profile_id, post_id, created_at
        `,
        [id, sid, profileId, postId],
      );
      repost = ins.rows[0] ? mapRepostRowToApi(ins.rows[0]) : null;

      await client.query(
        "UPDATE posts SET repost_count = repost_count + 1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [postId],
      );
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

    // Best-effort push notifications for new reposts.
    if (!had) {
      const recipientProfileId = String((p0 as any)?.author_profile_id ?? "").trim();
      const postText = String((p0 as any)?.text ?? "").trim();
      const parentPostId = String((p0 as any)?.parent_post_id ?? "").trim();

      if (recipientProfileId) {
        (async () => {
          try {
            const client2 = await pool.connect();
            try {
              const profRes = await client2.query<{
                id: string;
                owner_user_id: string | null;
                handle: string | null;
                display_name: string | null;
              }>(
                "SELECT id, owner_user_id, handle, display_name FROM profiles WHERE id = ANY($1::uuid[])",
                [[recipientProfileId, profileId]],
              );

              let recipientOwnerId = "";
              let senderOwnerId = "";
              let senderLabel = "Someone";

              for (const r of profRes.rows) {
                const pid = String(r?.id ?? "").trim();
                const owner = String(r?.owner_user_id ?? "").trim();

                if (pid === recipientProfileId) {
                  recipientOwnerId = owner;
                }
                if (pid === profileId) {
                  senderOwnerId = owner;
                  const h = String(r?.handle ?? "").trim();
                  const dn = String(r?.display_name ?? "").trim();
                  senderLabel = h ? `@${h}` : dn || senderLabel;
                }
              }

              if (!recipientOwnerId) return;
              if (senderOwnerId && senderOwnerId === recipientOwnerId) return;

              const title = `${senderLabel} reposted your post`;
              const body = postText ? (postText.length > 140 ? postText.slice(0, 137) + "…" : postText) : undefined;

              // If the reposted post is a reply, compute the thread root (best-effort)
              // so clients can open the first-line parent post and highlight the reply.
              let rootPostId = postId;
              if (parentPostId) {
                rootPostId = parentPostId;
                try {
                  let cur = rootPostId;
                  const seen = new Set<string>();
                  for (let i = 0; i < 25; i++) {
                    if (!cur || seen.has(cur)) break;
                    seen.add(cur);
                    const r = await client2.query<{ parent_post_id: string | null }>(
                      "SELECT parent_post_id FROM posts WHERE id = $1 LIMIT 1",
                      [cur],
                    );
                    const ppid = String(r.rows?.[0]?.parent_post_id ?? "").trim();
                    if (!ppid) break;
                    cur = ppid;
                    rootPostId = cur;
                  }
                } catch {
                  // best-effort
                }
              }

              try {
                const repo = new UserRepository();
                const tokenRows = await repo.listExpoPushTokensForUserIds([recipientOwnerId]);
                const expoMessages = tokenRows
                  .map((r) => String((r as any)?.expo_push_token ?? (r as any)?.expoPushToken ?? "").trim())
                  .filter(Boolean)
                  .map((to) => ({
                    to,
                    title,
                    body,
                    data: {
                      scenarioId: sid,
                      postId,
                      parentPostId: parentPostId || undefined,
                      rootPostId: rootPostId || undefined,
                      kind: "repost",
                      profileId: recipientProfileId,
                      actorProfileId: profileId,
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
            console.warn("Error while attempting repost push send:", (e as Error)?.message ?? e);
          }
        })();
      }
    }
    return { reposted: !had, repost: had ? null : repost, post: mapPostRowToApi(p0) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "";
    return { error: msg || "Toggle repost failed", status: 400 };
  } finally {
    client.release();
  }
}

export async function deleteRepostsForPostCascade(args: {
  client: PoolClient;
  postId: string;
}): Promise<void> {
  const pid = String(args.postId ?? "").trim();
  if (!pid) return;

  // Delete repost events for this post and its direct replies.
  await args.client
    .query(
      `
      DELETE FROM reposts
      WHERE post_id = $1
         OR post_id IN (SELECT id FROM posts WHERE parent_post_id = $1)
    `,
      [pid],
    )
    .catch(() => {});
}
