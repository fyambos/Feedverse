import type { PoolClient } from "pg";

export type ScenarioNotificationPrefs = {
  scenarioId: string;
  userId: string;
  mentionsEnabled: boolean;
  repliesEnabled: boolean;
  messagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  likesEnabled: boolean;
  repostsEnabled: boolean;
  quotesEnabled: boolean;
  ignoredProfileIds: string[];
};

export type ScenarioNotificationPrefsPatch = Partial<{
  mentionsEnabled: boolean;
  repliesEnabled: boolean;
  messagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  likesEnabled: boolean;
  repostsEnabled: boolean;
  quotesEnabled: boolean;
  ignoredProfileIds: string[];
  muteAll: boolean;
}>;

export function defaultScenarioNotificationPrefs(args: { scenarioId: string; userId: string }): ScenarioNotificationPrefs {
  return {
    scenarioId: String(args.scenarioId),
    userId: String(args.userId),
    mentionsEnabled: true,
    repliesEnabled: true,
    messagesEnabled: true,
    groupMessagesEnabled: true,
    likesEnabled: true,
    repostsEnabled: true,
    quotesEnabled: true,
    ignoredProfileIds: [],
  };
}

function normalizeUuidArray(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).map((s) => s.trim()).filter(Boolean);
}

function rowToPrefs(row: any, scenarioId: string, userId: string): ScenarioNotificationPrefs {
  const base = defaultScenarioNotificationPrefs({ scenarioId, userId });
  if (!row) return base;

  return {
    ...base,
    mentionsEnabled: row.mentions_enabled ?? row.mentionsEnabled ?? base.mentionsEnabled,
    repliesEnabled: row.replies_enabled ?? row.repliesEnabled ?? base.repliesEnabled,
    messagesEnabled: row.messages_enabled ?? row.messagesEnabled ?? base.messagesEnabled,
    groupMessagesEnabled: row.group_messages_enabled ?? row.groupMessagesEnabled ?? base.groupMessagesEnabled,
    likesEnabled: row.likes_enabled ?? row.likesEnabled ?? base.likesEnabled,
    repostsEnabled: row.reposts_enabled ?? row.repostsEnabled ?? base.repostsEnabled,
    quotesEnabled: row.quotes_enabled ?? row.quotesEnabled ?? base.quotesEnabled,
    ignoredProfileIds: normalizeUuidArray(row.ignored_profile_ids ?? row.ignoredProfileIds ?? base.ignoredProfileIds),
  };
}

export async function getScenarioNotificationPrefs(client: PoolClient, scenarioId: string, userId: string) {
  const sid = String(scenarioId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!sid || !uid) return null;

  const res = await client.query(
    `
    SELECT
      mentions_enabled,
      replies_enabled,
      messages_enabled,
      group_messages_enabled,
      likes_enabled,
      reposts_enabled,
      quotes_enabled,
      ignored_profile_ids
    FROM scenario_notification_prefs
    WHERE scenario_id = $1 AND user_id = $2
    LIMIT 1
  `,
    [sid, uid],
  );

  return rowToPrefs(res.rows?.[0], sid, uid);
}

export async function listScenarioNotificationPrefsByUserIds(
  client: PoolClient,
  scenarioId: string,
  userIds: string[],
): Promise<Map<string, ScenarioNotificationPrefs>> {
  const sid = String(scenarioId ?? "").trim();
  const ids = Array.isArray(userIds) ? userIds.map(String).map((s) => s.trim()).filter(Boolean) : [];

  const out = new Map<string, ScenarioNotificationPrefs>();
  if (!sid || ids.length === 0) return out;

  const res = await client.query(
    `
    SELECT
      user_id,
      mentions_enabled,
      replies_enabled,
      messages_enabled,
      group_messages_enabled,
      likes_enabled,
      reposts_enabled,
      quotes_enabled,
      ignored_profile_ids
    FROM scenario_notification_prefs
    WHERE scenario_id = $1
      AND user_id = ANY($2::uuid[])
  `,
    [sid, ids],
  );

  for (const r of res.rows ?? []) {
    const uid = String((r as any)?.user_id ?? "").trim();
    if (!uid) continue;
    out.set(uid, rowToPrefs(r, sid, uid));
  }

  return out;
}

export async function upsertScenarioNotificationPrefs(
  client: PoolClient,
  scenarioId: string,
  userId: string,
  patch: ScenarioNotificationPrefsPatch,
): Promise<ScenarioNotificationPrefs | null> {
  const sid = String(scenarioId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!sid || !uid) return null;

  const prev = await getScenarioNotificationPrefs(client, sid, uid);
  const base = prev ?? defaultScenarioNotificationPrefs({ scenarioId: sid, userId: uid });

  const muteAll = Boolean((patch as any)?.muteAll);

  const merged: ScenarioNotificationPrefs = {
    ...base,
    mentionsEnabled: muteAll ? false : patch.mentionsEnabled ?? base.mentionsEnabled,
    repliesEnabled: muteAll ? false : patch.repliesEnabled ?? base.repliesEnabled,
    messagesEnabled: muteAll ? false : patch.messagesEnabled ?? base.messagesEnabled,
    groupMessagesEnabled: muteAll ? false : patch.groupMessagesEnabled ?? base.groupMessagesEnabled,
    likesEnabled: muteAll ? false : patch.likesEnabled ?? base.likesEnabled,
    repostsEnabled: muteAll ? false : patch.repostsEnabled ?? base.repostsEnabled,
    quotesEnabled: muteAll ? false : patch.quotesEnabled ?? base.quotesEnabled,
    ignoredProfileIds:
      patch.ignoredProfileIds !== undefined
        ? normalizeUuidArray(patch.ignoredProfileIds)
        : base.ignoredProfileIds,
  };

  await client.query(
    `
    INSERT INTO scenario_notification_prefs (
      scenario_id,
      user_id,
      mentions_enabled,
      replies_enabled,
      messages_enabled,
      group_messages_enabled,
      likes_enabled,
      reposts_enabled,
      quotes_enabled,
      ignored_profile_ids,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[], now())
    ON CONFLICT (scenario_id, user_id)
    DO UPDATE SET
      mentions_enabled = EXCLUDED.mentions_enabled,
      replies_enabled = EXCLUDED.replies_enabled,
      messages_enabled = EXCLUDED.messages_enabled,
      group_messages_enabled = EXCLUDED.group_messages_enabled,
      likes_enabled = EXCLUDED.likes_enabled,
      reposts_enabled = EXCLUDED.reposts_enabled,
      quotes_enabled = EXCLUDED.quotes_enabled,
      ignored_profile_ids = EXCLUDED.ignored_profile_ids,
      updated_at = now()
  `,
    [
      sid,
      uid,
      merged.mentionsEnabled,
      merged.repliesEnabled,
      merged.messagesEnabled,
      merged.groupMessagesEnabled,
      merged.likesEnabled,
      merged.repostsEnabled,
      merged.quotesEnabled,
      merged.ignoredProfileIds,
    ],
  );

  return merged;
}

export function isIgnoredProfile(prefs: ScenarioNotificationPrefs | null | undefined, profileId: string): boolean {
  const pid = String(profileId ?? "").trim();
  if (!prefs || !pid) return false;
  return prefs.ignoredProfileIds.map(String).includes(pid);
}
