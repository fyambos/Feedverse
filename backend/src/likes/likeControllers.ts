import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { ListLikesForScenarioService, SetLikeStateService } from "./likeServices";

export const ListScenarioLikesController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const likes = await ListLikesForScenarioService(userId, scenarioId);
    if (!likes) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(likes);
  } catch (error: unknown) {
    console.error("Erreur récupération likes:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const SetPostLikeController = async (req: Request, res: Response) => {
  const isPost = req.method === HTTP_METHODS.POST;
  const isDelete = req.method === HTTP_METHODS.DELETE;
  if (!isPost && !isDelete) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
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

    const ensureLiked = isPost;

    const result = await SetLikeStateService({ userId, scenarioId, profileId, postId, ensureLiked });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    if ("error" in result) return res.status(result.status).json({ error: result.error });

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    console.error("Erreur set like:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
