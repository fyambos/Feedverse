// backend/src/users/userControllers.ts
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
import { normalizeUsername, validateUsername } from "../lib/username";


// PATCH /username
export const UpdateUsernameController = async (req: Request, res: Response) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const user = req.user as User | undefined;
    const userId = String(user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { username } = req.body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ error: "Invalid username" });
    }
    const usernameNormalized = normalizeUsername(username);
    const usernameErr = validateUsername(usernameNormalized);
    if (usernameErr) {
      return res.status(400).json({ error: usernameErr });
    }
    const repo = new UserRepository();
    // Check if username is taken by another user
    const existing = await repo.findByUsername(usernameNormalized);
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: "Username already in use" });
    }
    await repo.updateUsername(userId, usernameNormalized);
    return res.status(200).json({ username: usernameNormalized });
  } catch (error: unknown) {
    console.error("UpdateUsernameController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const GetUserProfileController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const tokenUser = req.user as User | undefined;
    const userId = String(tokenUser?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    // IMPORTANT: req.user comes from the JWT payload and can be stale.
    // Fetch the latest user record from DB so settings edits in NeonDB are reflected.
    const repo = new UserRepository();
    const user = await repo.findById(userId);
    if (!user) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: USER_MESSAGES.NOT_FOUND });

    // Never return password hashes.
    const { password_hash: _pw, ...safe } = user as any;
    return res.status(HTTP_STATUS.OK).json(safe);
  } catch (error: unknown) {
    console.error("GetUserProfileController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const UpdateUserAvatarController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const user = req.user as User | undefined;
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
    console.error("UpdateUserAvatarController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
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
    console.error("GetUsersByIdsController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

// POST /users/push-token
export const UpsertUserPushTokenController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const user = req.user as User | undefined;
    const userId = String(user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const expoPushToken = String(req.body?.expoPushToken ?? req.body?.expo_push_token ?? "").trim();
    const platformRaw = req.body?.platform;
    const platform = platformRaw == null ? null : String(platformRaw).trim() || null;

    if (!expoPushToken) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "expoPushToken is required" });
    }

    const repo = new UserRepository();
    await repo.upsertExpoPushToken({ userId, expoPushToken, platform });

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (error: unknown) {
    console.error("UpsertUserPushTokenController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

// DELETE /users/push-token
// Body or query can include expoPushToken. If omitted, deletes all tokens for the user.
export const DeleteUserPushTokenController = async (req: Request, res: Response) => {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = req.user as User | undefined;
    const userId = String(user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const expoPushToken = String(
      req.body?.expoPushToken ??
        req.body?.expo_push_token ??
        req.query?.expoPushToken ??
        req.query?.expo_push_token ??
        "",
    ).trim();

    const repo = new UserRepository();

    let deleted = 0;
    if (expoPushToken) {
      deleted = await repo.deleteExpoPushToken({ userId, expoPushToken });
    } else {
      deleted = await repo.deleteAllExpoPushTokensForUser({ userId });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true, deleted });
  } catch (error: unknown) {
    console.error("DeleteUserPushTokenController failed", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
