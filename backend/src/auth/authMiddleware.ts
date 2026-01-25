import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../users/userModels";
import { AUTH, HTTP_STATUS } from "../config/constants";
import { hashTokenSha256Hex, touchUserSession, touchUserSessionById } from "../sessions/sessionRepositories";

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

    // Always compute token hash for sessions UX ("isCurrent" marking).
    try {
      const tokenHash = hashTokenSha256Hex(token);
      req.authTokenHash = tokenHash;
    } catch {
      // ignore
    }

    const sessionId = String((decoded as any)?.sid ?? "").trim();
    if (sessionId) req.authSessionId = sessionId;

    // Sessions (best-effort):
    // - Preferred: if token includes a session id (sid), require an existing session row.
    // - Back-compat: if sid is missing, fall back to token-hash upsert.
    // - If the session is revoked, treat the token as invalid.
    try {
      const uid = String(payload.user.id);
      const tokenHash = String(req.authTokenHash ?? "").trim();

      const touched = sessionId
        ? await touchUserSessionById({
            sessionId,
            userId: uid,
            tokenHash,
            userAgent: req.get?.("User-Agent") ?? null,
            ip: req.headers?.["x-forwarded-for"] ?? req.ip,
          })
        : await touchUserSession({
            userId: uid,
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
