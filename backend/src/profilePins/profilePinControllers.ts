import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { ListProfilePinsForScenarioService, SetProfilePinnedPostService } from "./profilePinServices";

export const ListScenarioProfilePinsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const pins = await ListProfilePinsForScenarioService(userId, scenarioId);
    if (!pins) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(pins);
  } catch (error: unknown) {
    console.error("Erreur récupération profile pins:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const PutProfilePinnedPostController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.PUT) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const raw = req.body?.postId ?? req.body?.post_id;
    const postId = raw == null || raw === "" ? null : String(raw).trim();

    const result = await SetProfilePinnedPostService({ userId, profileId, postId });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    console.error("PutProfilePinnedPostController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
