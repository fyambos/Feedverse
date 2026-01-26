// backend/src/conversations/conversationRoutes.ts
import { markConversationMessagesRead, getUnreadCountsForProfile } from "../messages/messageRepositories";

import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { upload } from "../config/multer";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validationMiddleware";
import {
  listConversationsForScenario,
  getOrCreateConversation,
  updateConversationMeta,
  updateConversationParticipants,
  uploadConversationAvatar,
  deleteConversation,
} from "./conversationRepositories";

export const conversationRouter = Router();

const scenarioIdParam = z.object({ scenarioId: z.string().uuid() }).passthrough();
const conversationIdParam = z.object({ conversationId: z.string().uuid() }).passthrough();

conversationRouter.get(
  "/scenarios/:scenarioId/conversations",
  authMiddleware,
  validateParams(scenarioIdParam),
  validateQuery(z.object({ selectedProfileId: z.string().uuid() }).passthrough()),
  async (req, res) => {
  const scenarioId = String(req.params.scenarioId ?? "");
  const userId = String((req as any).user?.id ?? "");
  const selectedProfileId = String(req.query.selectedProfileId ?? "");

  const out = await listConversationsForScenario({ scenarioId, userId, selectedProfileId });
  if (out == null) return res.status(403).json({ error: "Forbidden" });

  return res.json({ conversations: out });
  },
);

conversationRouter.post(
  "/scenarios/:scenarioId/conversations:getOrCreate",
  authMiddleware,
  validateParams(scenarioIdParam),
  validateBody(
    z
      .object({
        selectedProfileId: z.string().uuid(),
        participantProfileIds: z.array(z.string().uuid()).default([]),
        title: z.string().trim().min(1).optional(),
        avatarUrl: z.string().trim().min(1).optional(),
      })
      .passthrough(),
  ),
  async (req, res) => {
  const scenarioId = String(req.params.scenarioId ?? "");
  const userId = String((req as any).user?.id ?? "");
  const selectedProfileId = String(req.body?.selectedProfileId ?? "");

  const participantProfileIds = Array.isArray(req.body?.participantProfileIds)
    ? req.body.participantProfileIds.map(String)
    : [];
  const title = req.body?.title;
  const avatarUrl = req.body?.avatarUrl;

  const out = await getOrCreateConversation({ scenarioId, userId, participantProfileIds, title, avatarUrl });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  return res.json(out);
  },
);

conversationRouter.put(
  "/conversations/:conversationId",
  authMiddleware,
  validateParams(conversationIdParam),
  validateBody(
    z
      .object({
        title: z.string().trim().min(1).optional(),
        avatarUrl: z.string().trim().min(1).optional(),
      })
      .passthrough(),
  ),
  async (req, res) => {
  const conversationId = String(req.params.conversationId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const title = req.body?.title;
  const avatarUrl = req.body?.avatarUrl;

  const out = await updateConversationMeta({ conversationId, userId, title, avatarUrl });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  return res.json(out);
  },
);

conversationRouter.post(
  "/conversations/:conversationId/avatar",
  authMiddleware,
  validateParams(conversationIdParam),
  upload.single("avatar"),
  async (req, res) => {
    const conversationId = String(req.params.conversationId ?? "");
    const userId = String((req as any).user?.id ?? "");

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "avatar file is required" });

    const out = await uploadConversationAvatar({ conversationId, userId, file });
    if (out == null) return res.status(403).json({ error: "Forbidden" });
    if ("error" in out) return res.status(out.status).json({ error: out.error });

    return res.json(out);
  },
);

conversationRouter.put(
  "/conversations/:conversationId/participants",
  authMiddleware,
  validateParams(conversationIdParam),
  validateBody(
    z
      .object({
        participantProfileIds: z.array(z.string().uuid()).default([]),
      })
      .passthrough(),
  ),
  async (req, res) => {
    const conversationId = String(req.params.conversationId ?? "");
    const userId = String((req as any).user?.id ?? "");

    const participantProfileIds = Array.isArray(req.body?.participantProfileIds)
      ? req.body.participantProfileIds.map(String)
      : [];

    const out = await updateConversationParticipants({ conversationId, userId, participantProfileIds });
    if (out == null) return res.status(403).json({ error: "Forbidden" });
    if ("error" in out) return res.status(out.status).json({ error: out.error });

    return res.json(out);
  },
);

conversationRouter.delete(
  "/conversations/:conversationId",
  authMiddleware,
  validateParams(conversationIdParam),
  async (req, res) => {
  const conversationId = String(req.params.conversationId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const out = await deleteConversation({ conversationId, userId });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  return res.json(out);
  },
);

// Mark all messages in a conversation as read for a profile
conversationRouter.post(
  "/conversations/:conversationId/read",
  authMiddleware,
  validateParams(conversationIdParam),
  validateBody(z.object({ profileId: z.string().uuid() }).passthrough()),
  async (req, res) => {
  const conversationId = String(req.params.conversationId ?? "");
  const profileId = String(req.body?.profileId ?? "");
  if (!conversationId || !profileId) return res.status(400).json({ error: "Missing params" });
  await markConversationMessagesRead(conversationId, profileId);
  // Optionally: emit a realtime event here
  res.json({ ok: true });
  },
);

// Get unread counts per conversation for a profile in a scenario
conversationRouter.get(
  "/scenarios/:scenarioId/unread",
  authMiddleware,
  validateParams(scenarioIdParam),
  validateQuery(z.object({ profileId: z.string().uuid() }).passthrough()),
  async (req, res) => {
  const scenarioId = String(req.params.scenarioId ?? "");
  const profileId = String(req.query.profileId ?? "");
  if (!scenarioId || !profileId) return res.status(400).json({ error: "Missing params" });
  const unread = await getUnreadCountsForProfile(scenarioId, profileId);
  res.json({ unread });
  },
); 
