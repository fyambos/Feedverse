import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  AUTH,
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
} from "../config/constants";
import { LoginUserService, RegisterUserService } from "./authServices";
import { upload } from "../config/multer";
import type { RegisterResponse } from "./authModels";

function signAuthToken(payload: unknown) {
  const expiresIn = String(AUTH.EXPIRATION_TIME ?? "").trim();
  if (!expiresIn || expiresIn.toLowerCase() === "none") {
    return jwt.sign(payload as any, AUTH.SECRET_KEY);
  }
  // `expiresIn` accepts "1h", "30d", etc. When sourced from env it is a plain string,
  // so we cast for TypeScript (jsonwebtoken validates at runtime).
  return jwt.sign(payload as any, AUTH.SECRET_KEY, { expiresIn: expiresIn as any });
}

export const RegisterController = [
  upload.single("avatar"),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
    }

    try {
      const { username, name, email, password_hash, avatar_url } = req.body;
      const avatarFile = req.file;

      const result = await RegisterUserService(
        {
          username,
          name,
          email,
          password_hash,
          avatar_url,
        },
        avatarFile,
      );

      if (result.errors) {
        return res.status(HTTP_STATUS.OK).json({
          errors: result.errors,
        });
      }

      const createdUser = (result.user as RegisterResponse | undefined)?.User;
      if (!createdUser) {
        return res
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
      }

      const token = signAuthToken({ user: createdUser });

      res.status(HTTP_STATUS.CREATED).json({
        message: USER_MESSAGES.CREATION_SUCCESS,
        token,
        user: createdUser,
      });
    } catch (error: unknown) {
      console.error("Erreur lors de l'inscription:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];

export const LoginController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .send(ERROR_MESSAGES.METHOD_NOT_ALLOWED);
  }

  try {
    const identifier = String(
      req.body?.identifier ?? req.body?.email ?? req.body?.username ?? "",
    ).trim();
    const password_hash = req.body?.password_hash;

    const result = await LoginUserService({ email: identifier, password_hash });

    if (result?.error) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: ERROR_MESSAGES.INVALID_REQUEST,
        message: result.error,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
      });
    }

    const signed = signAuthToken({ user: result?.user });

    res.status(HTTP_STATUS.OK).json({
      message: USER_MESSAGES.LOGIN_SUCCESS,
      token: signed,
      user: result?.user,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la connexion:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const ProtectedController = async (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json("Accès à la route protégé !");
};
