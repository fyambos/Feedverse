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
      throw new Error();
    }

    jwt.verify(token, AUTH.SECRET_KEY, (err: unknown, user: User) => {
      if (err)
        return res.status(HTTP_STATUS.FORBIDDEN).send(AUTH.INVALID_TOKEN);
      req.user = user;
      next();
    });
  } catch (err: unknown) {
    console.error("Erreur authentification : ", err);
    res.status(HTTP_STATUS.UNAUTHORIZED).send(AUTH.UNAUTHORIZED_ACCESS);
  }
};
