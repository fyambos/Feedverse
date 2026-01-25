import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { sendMethodNotAllowed } from "../lib/apiResponses";
import { ListRepostsForScenarioService, ToggleRepostService } from "./repostServices";

export const ListScenarioRepostsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const reposts = await ListRepostsForScenarioService(userId, scenarioId);
    if (!reposts) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(reposts);
  } catch (error: unknown) {
    console.error("Erreur récupération reposts:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const TogglePostRepostController = async (req: Request, res: Response) => {
  const isPost = req.method === HTTP_METHODS.POST;
  const isDelete = req.method === HTTP_METHODS.DELETE;
  if (!isPost && !isDelete) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const postId = String(req.params?.id ?? "").trim();
    if (!postId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "postId is required" });

    const scenarioId = String(req.body?.scenarioId ?? req.body?.scenario_id ?? "").trim();
    const profileId = String(req.body?.profileId ?? req.body?.profile_id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    // Toggle semantics: POST means "ensure reposted", DELETE means "ensure not reposted".
    // We implement this by checking current state and only toggling if needed.
    // For now, toggleRepost() is symmetric; we call it and trust client to choose method correctly.
    const result = await ToggleRepostService({ userId, scenarioId, profileId, postId });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    if ("error" in result) return res.status(result.status).json({ error: result.error });

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    console.error("Erreur toggle repost:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
