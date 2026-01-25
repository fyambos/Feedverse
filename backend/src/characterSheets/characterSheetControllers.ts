import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { sendMethodNotAllowed } from "../lib/apiResponses";
import {
  GetCharacterSheetForProfileService,
  ListCharacterSheetsForScenarioService,
  UpsertCharacterSheetForProfileService,
} from "./characterSheetServices";

export const ListScenarioCharacterSheetsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const sheets = await ListCharacterSheetsForScenarioService(userId, scenarioId);
    if (!sheets) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(sheets);
  } catch (error: unknown) {
    console.error("Erreur récupération character sheets:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const GetProfileCharacterSheetController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const sheet = await GetCharacterSheetForProfileService(userId, profileId);
    if (!sheet) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json({ sheet });
  } catch (error: unknown) {
    console.error("Erreur get character sheet:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const PutProfileCharacterSheetController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.PUT) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const patch = req.body ?? {};

    const result = await UpsertCharacterSheetForProfileService({ userId, profileId, patch });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ sheet: result.sheet });
  } catch (error: unknown) {
    console.error("PutProfileCharacterSheetController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
