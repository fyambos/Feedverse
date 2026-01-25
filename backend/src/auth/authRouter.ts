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

authRouter.post(ROUTES_AUTH.REGISTER, RegisterController);
authRouter.post(ROUTES_AUTH.LOGIN, LoginController);
authRouter.post(ROUTES_AUTH.REFRESH_TOKEN, RefreshTokenController);
authRouter.post(ROUTES_AUTH.LOGOUT, authMiddleware, LogoutController);
authRouter.get(ROUTES_AUTH.PROTECTED, ProtectedController);

export default authRouter;
