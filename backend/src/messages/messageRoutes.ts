 // backend/src/messages/messageRoutes.ts
import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { upload } from "../config/multer";
import { deleteMessage, listMessages, sendMessage, sendMessageWithImages, updateMessage } from "./messageRepositories";

export const messageRouter = Router();

messageRouter.get("/conversations/:conversationId/messages", authMiddleware, async (req, res) => {
  const conversationId = String(req.params.conversationId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const limit = req.query?.limit ? Number(req.query.limit) : undefined;
  const beforeCreatedAt = req.query?.beforeCreatedAt ? String(req.query.beforeCreatedAt) : undefined;

  // console.info("[messages] list", { conversationId, userId, limit, beforeCreatedAt });
  const selectedProfileId = req.query?.selectedProfileId ? String(req.query.selectedProfileId) : undefined;
  const out = await listMessages({ conversationId, userId, selectedProfileId, limit, beforeCreatedAt });
  // console.info("[messages] list: resultCount", { conversationId, count: out?.messages?.length ?? 0 });
  if (out == null) return res.status(403).json({ error: "Forbidden" });

  return res.json(out);
});

messageRouter.post("/conversations/:conversationId/messages", authMiddleware, upload.array("images", 8), async (req, res) => {
  const conversationId = String(req.params.conversationId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const senderProfileId = String(req.body?.senderProfileId ?? "");
  const text = String(req.body?.text ?? "");

  const kind = String(req.body?.kind ?? "text").trim() || "text";

  // console.info("[messages] create", { conversationId, userId, senderProfileId, kind, hasFiles: Array.isArray((req as any).files) && (req as any).files.length > 0 });

  const files = Array.isArray((req as any).files) ? (((req as any).files as any[]) as Express.Multer.File[]) : [];
  const out =
    files.length > 0
      ? await sendMessageWithImages({ conversationId, userId, senderProfileId, text, files, kind })
      : await sendMessage({ conversationId, userId, senderProfileId, text, kind });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  // console.info("[messages] create: ok", { conversationId, messageId: (out as any)?.message?.id ?? null, kind: (out as any)?.message?.kind ?? kind });
  return res.json(out);
});

messageRouter.put("/messages/:messageId", authMiddleware, async (req, res) => {
  const messageId = String(req.params.messageId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const text = String(req.body?.text ?? "");
  const senderProfileId = req.body?.senderProfileId;

  const out = await updateMessage({ messageId, userId, text, senderProfileId });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  return res.json(out);
});

messageRouter.delete("/messages/:messageId", authMiddleware, async (req, res) => {
  const messageId = String(req.params.messageId ?? "");
  const userId = String((req as any).user?.id ?? "");

  const out = await deleteMessage({ messageId, userId });
  if (out == null) return res.status(403).json({ error: "Forbidden" });
  if ("error" in out) return res.status(out.status).json({ error: out.error });

  return res.json(out);
});
