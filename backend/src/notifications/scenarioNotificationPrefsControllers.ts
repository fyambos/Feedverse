import type { Request, Response } from "express";
import { pool } from "../config/database";
import { getScenarioNotificationPrefs, upsertScenarioNotificationPrefs } from "./scenarioNotificationPrefs";

export async function GetScenarioNotificationPrefsController(req: Request, res: Response) {
  const scenarioId = String((req as any)?.params?.id ?? "").trim();
  const userId = String((req as any)?.user?.id ?? "").trim();

  if (!scenarioId || !userId) {
    res.status(400).json({ error: "Missing scenarioId or user" });
    return;
  }

  const client = await pool.connect();
  try {
    const prefs = await getScenarioNotificationPrefs(client, scenarioId, userId);
    res.json({ prefs });
  } catch (e: any) {
    console.error("GetScenarioNotificationPrefsController failed", e);
    res.status(500).json({ error: "Failed to load notification prefs" });
  } finally {
    client.release();
  }
}

export async function PutScenarioNotificationPrefsController(req: Request, res: Response) {
  const scenarioId = String((req as any)?.params?.id ?? "").trim();
  const userId = String((req as any)?.user?.id ?? "").trim();

  if (!scenarioId || !userId) {
    res.status(400).json({ error: "Missing scenarioId or user" });
    return;
  }

  const body = (req as any)?.body ?? {};

  const patch = {
    mentionsEnabled: body?.mentionsEnabled ?? body?.mentions_enabled,
    repliesEnabled: body?.repliesEnabled ?? body?.replies_enabled,
    messagesEnabled: body?.messagesEnabled ?? body?.messages_enabled,
    groupMessagesEnabled: body?.groupMessagesEnabled ?? body?.group_messages_enabled,
    likesEnabled: body?.likesEnabled ?? body?.likes_enabled,
    repostsEnabled: body?.repostsEnabled ?? body?.reposts_enabled,
    quotesEnabled: body?.quotesEnabled ?? body?.quotes_enabled,
    ignoredProfileIds: body?.ignoredProfileIds ?? body?.ignored_profile_ids,
    muteAll: body?.muteAll ?? body?.mute_all,
  } as any;

  const client = await pool.connect();
  try {
    const prefs = await upsertScenarioNotificationPrefs(client, scenarioId, userId, patch);
    res.json({ prefs });
  } catch (e: any) {
    console.error("PutScenarioNotificationPrefsController failed", e);
    res.status(500).json({ error: "Failed to update notification prefs" });
  } finally {
    client.release();
  }
}
