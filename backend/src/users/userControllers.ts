import { UserRepository } from "./userRepositories";

// PATCH /username
export const UpdateUsernameController = async (req: Request, res: Response) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const user: User = req.user;
    const userId = String(user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { username } = req.body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ error: "Invalid username" });
    }
    const usernameNormalized = username.trim();
    const repo = new UserRepository();
    // Check if username is taken by another user
    const existing = await repo.findByUsername(usernameNormalized);
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: "Username already in use" });
    }
    await repo.updateUsername(userId, usernameNormalized);
    return res.status(200).json({ username: usernameNormalized });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to update username" });
  }
};
import { Request, Response } from "express";
import { User } from "./userModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { UserRepository } from "./userRepositories";
import {
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
} from "../config/constants";

export const GetUserProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    // Récupération de l'utilisateur via requête client (la requête est de type `Request` de base + étendue avec `User`)
    const user: User = req.user;

    res.status(HTTP_STATUS.OK).send(user);
  } catch (error: unknown) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: USER_MESSAGES.NOT_FOUND,
      error: error,
    });
  }
};

export const UpdateUserAvatarController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const user: User = req.user;
    const userId = String(user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const file = req.file;
    if (!file) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "avatar file is required" });

    const repo = new UserRepository();
    const previousUrl = await repo.getAvatarUrl(userId);
    if (previousUrl) {
      try {
        await r2Service.deleteByPublicUrl(previousUrl);
      } catch {
        // best-effort: don't block replacing avatar if delete fails
      }
    }

    const avatarUrl = await r2Service.uploadAvatar(file, userId);
    await repo.updateAvatar_url(userId, avatarUrl);

    return res.status(HTTP_STATUS.OK).json({ avatarUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: msg || ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const GetUsersByIdsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const idsRaw = req.query.ids;
    let ids: string[] = [];
    if (typeof idsRaw === "string") {
      ids = idsRaw.split(",").map((s) => String(s).trim()).filter(Boolean);
    } else if (Array.isArray(idsRaw)) {
      ids = idsRaw.map((s) => String(s).trim()).filter(Boolean);
    }

    if (ids.length === 0) {
      return res.status(HTTP_STATUS.OK).json({ users: [] });
    }

    const repo = new UserRepository();
    const rows = await repo.findByIds(ids);

    const users = (rows || []).map((r) => ({ id: r.id, username: r.username, avatarUrl: r.avatar_url ?? null }));

    return res.status(HTTP_STATUS.OK).json({ users });
  } catch (error: unknown) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: USER_MESSAGES.FAILED_FETCH, error });
  }
};
