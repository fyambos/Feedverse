import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import { sendMethodNotAllowed } from "../lib/apiResponses";
import { r2Service } from "../config/cloudflare/r2Service";
import { pool } from "../config/database";
import {
  AdoptPublicProfileService,
  CreateProfileForScenarioService,
  DeleteProfileCascadeService,
  ListProfilesForScenarioService,
  TransferProfilesService,
  UpdateProfileService,
} from "./profileServices";

export const ListScenarioProfilesController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const profiles = await ListProfilesForScenarioService(userId, scenarioId);
    if (!profiles) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    return res.status(HTTP_STATUS.OK).json(profiles);
  } catch (error: unknown) {
    console.error("Erreur récupération profiles:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const CreateScenarioProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const input = {
      displayName: req.body?.displayName ?? req.body?.display_name,
      handle: req.body?.handle,
      avatarUrl: req.body?.avatarUrl ?? req.body?.avatar_url,
      headerUrl: req.body?.headerUrl ?? req.body?.header_url,
      bio: req.body?.bio,
      isPublic: req.body?.isPublic ?? req.body?.is_public,
      isPrivate: req.body?.isPrivate ?? req.body?.is_private,
      joinedDate: req.body?.joinedDate ?? req.body?.joined_date,
      location: req.body?.location,
      link: req.body?.link,
      followerCount: req.body?.followerCount ?? req.body?.follower_count,
      followingCount: req.body?.followingCount ?? req.body?.following_count,
    };

    const result = await CreateProfileForScenarioService({ userId, scenarioId, input });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.CREATED).json({ profile: result.profile });
  } catch (error: unknown) {
    console.error("CreateScenarioProfileController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.PATCH) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const patch = req.body ?? {};

    // console.log("UpdateProfileController: attempt", { userId, profileId, patch });
    const result = await UpdateProfileService({ userId, profileId, patch });

    // Log the service result for debugging when client reports failure
    // console.log("UpdateProfileController: result", { userId, profileId, result });

    if (!result) {
      // console.log("UpdateProfileController: denied", { userId, profileId, patch });
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    if ("error" in result) {
      // console.log("UpdateProfileController: service error", { userId, profileId, error: result.error, status: result.status });
      return res.status(result.status).json({ error: result.error });
    }

    //console.log("UpdateProfileController: success", { userId, profileId });
    return res.status(HTTP_STATUS.OK).json({ profile: result.profile });
  } catch (error: unknown) {
    console.error("Error updating profile:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const DeleteProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.DELETE) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const result = await DeleteProfileCascadeService({ userId, profileId });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (error: unknown) {
    console.error("Error deleting profile:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const AdoptProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const result = await AdoptPublicProfileService({ userId, profileId });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ profile: result.profile });
  } catch (error: unknown) {
    console.error("Error adopting profile:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateProfileAvatarController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const file = req.file;
    if (!file) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "avatar file is required" });

    const prev = await pool.query(
      "SELECT owner_user_id, avatar_url, is_public FROM profiles WHERE id = $1",
      [profileId],
    );
    const prevRow = prev.rows[0];
    if (!prevRow) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Profile not found" });
    if (String(prevRow.owner_user_id) !== userId && !Boolean(prevRow.is_public)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    const previousUrl = prevRow.avatar_url != null ? String(prevRow.avatar_url) : "";
    if (previousUrl) {
      try {
        await r2Service.deleteByPublicUrl(previousUrl);
      } catch {
        // best-effort
      }
    }

    const avatarUrl = await r2Service.uploadProfileAvatar(file, profileId);
    const result = await UpdateProfileService({ userId, profileId, patch: { avatarUrl } });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ avatarUrl, profile: result.profile });
  } catch (error: unknown) {
    console.error("UpdateProfileAvatarController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateProfileHeaderController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const profileId = String(req.params?.id ?? "").trim();
    if (!profileId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "profileId is required" });

    const file = req.file;
    if (!file) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "header file is required" });

    const prev = await pool.query(
      "SELECT owner_user_id, header_url, is_public FROM profiles WHERE id = $1",
      [profileId],
    );
    const prevRow = prev.rows[0];
    if (!prevRow) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Profile not found" });
    if (String(prevRow.owner_user_id) !== userId && !Boolean(prevRow.is_public)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });
    }

    const previousUrl = prevRow.header_url != null ? String(prevRow.header_url) : "";
    if (previousUrl) {
      try {
        await r2Service.deleteByPublicUrl(previousUrl);
      } catch {
        // best-effort
      }
    }

    const headerUrl = await r2Service.uploadProfileHeader(file, profileId);
    const result = await UpdateProfileService({ userId, profileId, patch: { headerUrl } });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json({ headerUrl, profile: result.profile });
  } catch (error: unknown) {
    console.error("UpdateProfileHeaderController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const TransferProfilesController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String(req.params?.id ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const toUserId = String(req.body?.toUserId ?? req.body?.to_user_id ?? "").trim();
    const profileIdsRaw = req.body?.profileIds ?? req.body?.profile_ids;
    const profileIds = Array.isArray(profileIdsRaw) ? profileIdsRaw.map(String).filter(Boolean) : [];

    const result = await TransferProfilesService({ userId, scenarioId, toUserId, profileIds });
    if (!result) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error: unknown) {
    console.error("Erreur transfert profiles:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
