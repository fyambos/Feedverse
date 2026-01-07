import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  AUTH,
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
} from "../config/constants";
import { LoginService, RegisterService } from "./authServices";
import { upload } from "../config/multer";

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

      const result = await RegisterService(
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

      res.status(HTTP_STATUS.CREATED).json({
        message: USER_MESSAGES.CREATION_SUCCESS,
        user: result.user,
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
    const { email, password_hash } = req.body;

    const result = await LoginService({
      email,
      password_hash,
    });

    if (result.errors) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        errors: result.errors,
      });
    }

    res.status(HTTP_STATUS.OK).json(result.user);
  } catch (error: unknown) {
    console.error("Erreur lors de la connexion:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

export const ProtectedController = async (res: Response) => {
  res.status(HTTP_STATUS.OK).json(`Accès à la route protégé !`);
};
