import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_METHODS, HTTP_STATUS } from "../config/constants";
import {
  listActiveUserSessions,
  revokeOtherUserSessions,
} from "./sessionRepositories";
import type { UserSessionApi } from "./sessionModels";

function toIso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.valueOf()) ? d.toISOString() : new Date().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isFinite(d.valueOf()) ? d.toISOString() : new Date().toISOString();
}

export const ListSessionsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const currentHash = String(req.authTokenHash ?? "").trim();

    const rows = await listActiveUserSessions({ userId });

    const sessions: UserSessionApi[] = rows.map((r) => ({
      id: String((r as any).id),
      userAgent: (r as any).user_agent == null ? null : String((r as any).user_agent),
      ip: (r as any).ip == null ? null : String((r as any).ip),
      createdAt: toIso((r as any).created_at),
      lastSeenAt: toIso((r as any).last_seen_at),
      isCurrent: currentHash ? String((r as any).token_hash) === currentHash : false,
    }));

    const currentSession = sessions.find((s) => s.isCurrent) ?? null;
    const otherSessions = sessions.filter((s) => !s.isCurrent);

    return res.status(HTTP_STATUS.OK).json({ currentSession, otherSessions });
  } catch (error: unknown) {
    console.error("List sessions failed:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const LogoutOtherSessionsController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const currentHash = String(req.authTokenHash ?? "").trim();
    if (!currentHash) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Missing current session context" });
    }

    const out = await revokeOtherUserSessions({ userId, keepTokenHash: currentHash });
    const revokedCount = Number(out?.revokedCount ?? 0);

    return res.status(HTTP_STATUS.OK).json({ revokedCount });
  } catch (error: unknown) {
    console.error("Logout other sessions failed:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
