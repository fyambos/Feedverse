import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../users/userModels";
import { AUTH, HTTP_STATUS } from "../config/constants";
import { hashTokenSha256Hex, touchUserSession } from "../sessions/sessionRepositories";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.header(AUTH.HEADER_NAME)?.replace(AUTH.BEARER_PREFIX, "");

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).send(AUTH.MISSING_TOKEN);
    }

    let decoded: unknown;
    try {
      decoded = jwt.verify(token, AUTH.SECRET_KEY);
    } catch {
      return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);
    }

    const payload = decoded as { user?: User } | null;
    if (!payload?.user) return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);

    req.user = payload.user;

    // Sessions (best-effort):
    // - Hash the token and upsert last_seen_at.
    // - If the session is revoked, treat the token as invalid.
    try {
      const tokenHash = hashTokenSha256Hex(token);
      req.authTokenHash = tokenHash;

      const touched = await touchUserSession({
        userId: String(payload.user.id),
        tokenHash,
        userAgent: req.get?.("User-Agent") ?? null,
        ip: req.headers?.["x-forwarded-for"] ?? req.ip,
      });

      if (touched?.sessionUserId && String(touched.sessionUserId) !== String(payload.user.id)) {
        return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);
      }
      if (touched?.revokedAt) {
        return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);
      }
    } catch {
      // Best-effort: do not block requests if session tracking is misconfigured.
    }

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    console.error("Erreur authentification :", msg || "unknown");
    return res.status(HTTP_STATUS.UNAUTHORIZED).send(AUTH.UNAUTHORIZED_ACCESS);
  }
};
