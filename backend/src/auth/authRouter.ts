import { Router } from "express";
const authRouter = Router();

import {
  LoginController,
  ProtectedController,
  RegisterController,
  RefreshTokenController,
  LogoutController,
} from "./authControllers";
import { ROUTES_AUTH } from "../config/constants";
import { authMiddleware } from "./authMiddleware";
import { z } from "zod";
import { validateBody } from "../middleware/validationMiddleware";

const loginBodySchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password_hash: z.string().min(1),
  })
  .refine((v) => Boolean((v.identifier ?? v.email ?? v.username)?.toString().trim()), {
    message: "identifier is required",
    path: ["identifier"],
  })
  .passthrough();

const refreshBodySchema = z
  .object({
    refreshToken: z.string().trim().min(1),
  })
  .passthrough();

authRouter.post(ROUTES_AUTH.REGISTER, RegisterController);
authRouter.post(ROUTES_AUTH.LOGIN, validateBody(loginBodySchema), LoginController);
authRouter.post(ROUTES_AUTH.REFRESH_TOKEN, validateBody(refreshBodySchema), RefreshTokenController);
authRouter.post(ROUTES_AUTH.LOGOUT, authMiddleware, LogoutController);
authRouter.get(ROUTES_AUTH.PROTECTED, ProtectedController);

export default authRouter;
