import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { sendMethodNotAllowed } from "../lib/apiResponses";
import { ListGlobalTagsService } from "./globalTagServices";

export const ListGlobalTagsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    // Keep it authenticated (consistent with the rest of the API).
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const q = typeof req.query?.q === "string" ? String(req.query.q) : undefined;
    const tags = await ListGlobalTagsService(q);
    return res.status(HTTP_STATUS.OK).json(tags);
  } catch (error: unknown) {
    console.error("Erreur récupération global tags:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
