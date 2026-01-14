import { Router } from "express";
const userRouter = Router();

import {
  GetUserProfileController,
  GetUserScenariosController,
} from "./userControllers";
import { authMiddleware } from "../auth/authMiddleware";
import { ROUTES_USERS } from "../config/constants";

userRouter.get(ROUTES_USERS.PROFILE, authMiddleware, GetUserProfileController);
userRouter.get(
  ROUTES_USERS.SCENARIOS,
  authMiddleware,
  GetUserScenariosController,
);

export default userRouter;
