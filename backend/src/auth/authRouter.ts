import { Router } from "express";
const authRouter = Router();

import {
  LoginController,
  ProtectedController,
  RegisterController,
} from "./authControllers";
import { ROUTES_AUTH } from "../config/constants";

authRouter.post(ROUTES_AUTH.REGISTER, RegisterController);
authRouter.post(ROUTES_AUTH.LOGIN, LoginController);
authRouter.get(ROUTES_AUTH.PROTECTED, ProtectedController);

export default authRouter;
