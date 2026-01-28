import type { PoolClient } from "pg";

export type NotificationCooldownKind = "like" | "repost";

export async function bumpNotificationCooldownIfAllowed(
  client: PoolClient,
  args: {
    recipientUserId: string;
    kind: NotificationCooldownKind;
    actorProfileId: string;
    postId: string;
    cooldownMinutes?: number;
  },
): Promise<boolean> {
  const recipientUserId = String(args.recipientUserId ?? "").trim();
  const kind = String(args.kind ?? "").trim() as NotificationCooldownKind;
  const actorProfileId = String(args.actorProfileId ?? "").trim();
  const postId = String(args.postId ?? "").trim();
  const cooldownMinutes = Number.isFinite(args.cooldownMinutes) ? Number(args.cooldownMinutes) : 15;

  if (!recipientUserId || !kind || !actorProfileId || !postId) return true;
  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes <= 0) return true;

  // One statement to be race-safe:
  // - insert if first time
  // - else update only if outside cooldown window
  // If we updated/inserted, RETURNING yields a row -> allowed.
  const q = `
    INSERT INTO notification_cooldowns (recipient_user_id, kind, actor_profile_id, post_id, last_sent_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (recipient_user_id, kind, actor_profile_id, post_id)
    DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
      WHERE notification_cooldowns.last_sent_at < (NOW() - ($5 || ' minutes')::interval)
    RETURNING last_sent_at
  `;

  const res = await client.query(q, [recipientUserId, kind, actorProfileId, postId, String(cooldownMinutes)]);
  return (res.rowCount ?? 0) > 0;
}
