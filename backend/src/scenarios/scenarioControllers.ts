import { r2Service } from "../config/cloudflare/r2Service";
import { ScenarioRepository } from "./scenarioRepositories";
import { pool } from "../config/database";


import type { Request, Response } from "express";
import { HTTP_METHODS, HTTP_STATUS, ERROR_MESSAGES } from "../config/constants";
import {
  CreateScenarioService,
  DeleteScenarioService,
  JoinScenarioByInviteCodeService,
  LeaveScenarioService,
  ListScenariosService,
  TransferScenarioOwnershipService,
  UpdateScenarioService,
} from "./scenarioServices";

export const ListScenariosController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    const scenarios = await ListScenariosService(userId);
    return res.status(HTTP_STATUS.OK).json(scenarios);
  } catch (error: unknown) {
    console.error("Erreur récupération scénarios:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const JoinScenarioByInviteCodeController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    const inviteCode = String(req.body?.inviteCode ?? req.body?.invite_code ?? "")
      .trim()
      .toUpperCase();

    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }
    if (!inviteCode) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "inviteCode is required" });
    }

    const result = await JoinScenarioByInviteCodeService({ userId, inviteCode });
    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Scenario not found" });
    }

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    console.error("Erreur rejoindre scénario:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const CreateScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }

    const name = String(req.body?.name ?? "").trim();
    const cover = String(req.body?.cover ?? req.body?.cover_url ?? "").trim();
    const inviteCode = String(req.body?.inviteCode ?? req.body?.invite_code ?? "").trim().toUpperCase();
    const description = req.body?.description != null ? String(req.body.description) : null;
    const mode = String(req.body?.mode ?? "story").trim();
    const settings = req.body?.settings ?? {};
    const gmUserIds = Array.isArray(req.body?.gmUserIds) ? req.body.gmUserIds : undefined;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : undefined;

    const created = await CreateScenarioService({
      userId,
      name,
      cover,
      inviteCode,
      description,
      mode,
      settings,
      gmUserIds,
      tags,
    });

    if (!created) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Invalid request" });
    }

    return res.status(HTTP_STATUS.CREATED).json({ scenario: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json({ error: msg || ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.PATCH) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });
    }

    const patch = req.body ?? {};

    const updated = await UpdateScenarioService({ userId, scenarioId, patch });
    if (!updated) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    return res.status(HTTP_STATUS.OK).json({ scenario: updated });
  } catch (error: unknown) {
    console.error("Erreur mise à jour scénario:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const DeleteScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.DELETE) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });
    }

    const ok = await DeleteScenarioService({ userId, scenarioId });
    if (!ok) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (error: unknown) {
    console.error("Erreur suppression scénario:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const LeaveScenarioController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });
    }

    const result = await LeaveScenarioService({ userId, scenarioId });
    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json({ error: msg || ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const TransferScenarioOwnershipController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
    }

    const scenarioId = String(req.params?.id ?? "").trim();
    const toUserId = String(req.body?.toUserId ?? req.body?.to_user_id ?? "").trim();

    if (!scenarioId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });
    }
    if (!toUserId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "toUserId is required" });
    }

    const updated = await TransferScenarioOwnershipService({ userId, scenarioId, toUserId });
    if (!updated) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    return res.status(HTTP_STATUS.OK).json({ scenario: updated });
  } catch (error: unknown) {
    console.error("Erreur transfert owner scénario:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }

 
};
 // POST /scenarios/:id/cover
  export const UploadScenarioCoverController = async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const scenarioId = String(req.params.id ?? "").trim();
      if (!scenarioId) return res.status(400).json({ error: "Missing scenario id" });
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      const coverUrl = await r2Service.uploadScenarioCover(file, scenarioId);
      // Update scenario cover in DB
      const repo = new ScenarioRepository();
      await repo.updateCover(scenarioId, coverUrl);
      return res.status(200).json({ coverUrl });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to upload cover" });
    }
  };