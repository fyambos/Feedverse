import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../users/userModels";
import { AUTH, HTTP_STATUS } from "../config/constants";

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

    jwt.verify(token, AUTH.SECRET_KEY, (err: unknown, decoded: unknown) => {
      if (err) return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);

      const payload = decoded as { user?: User } | null;
      if (!payload?.user) return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);

      req.user = payload.user;
      next();
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    console.error("Erreur authentification :", msg || "unknown");
    return res.status(HTTP_STATUS.UNAUTHORIZED).send(AUTH.UNAUTHORIZED_ACCESS);
  }
};
