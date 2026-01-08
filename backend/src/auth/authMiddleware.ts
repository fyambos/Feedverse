import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JwtTokenPayload } from "./authModels";
import { UserRepository } from "../users/userRepositories";
import { AUTH, HTTP_STATUS } from "../config/constants";

const userRepository = new UserRepository();

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.header(AUTH.HEADER_NAME)?.replace(AUTH.BEARER_PREFIX, "");

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.UNAUTHORIZED_ACCESS,
      });
    }

    const decoded = jwt.verify(token, AUTH.SECRET_KEY) as JwtTokenPayload;

    console.log("Token décodé:", decoded);

    const user = await userRepository.findById(decoded.id);

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }
    req.user = user;

    next();
  } catch (err: unknown) {
    console.error("Erreur authentification:", err);

    if (err instanceof jwt.TokenExpiredError) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.TOKEN_EXPIRED,
      });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: AUTH.INVALID_TOKEN,
      });
    }

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: AUTH.UNAUTHORIZED_ACCESS,
    });
  }
};
