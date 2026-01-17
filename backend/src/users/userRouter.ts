import { Router } from "express";
const userRouter = Router();

import {
  GetUserProfileController,
  GetUserScenariosController,
  DeleteUserController,
  UpdateUserController,
} from "./userControllers";
import { authMiddleware } from "../auth/authMiddleware";
import { ROUTES_USERS } from "../config/constants";

userRouter.get(ROUTES_USERS.PROFILE, authMiddleware, GetUserProfileController);
userRouter.get(
  ROUTES_USERS.SCENARIOS,
  authMiddleware,
  GetUserScenariosController,
);
userRouter.delete(ROUTES_USERS.BY_ID, authMiddleware, DeleteUserController);
userRouter.patch(ROUTES_USERS.ME, authMiddleware, UpdateUserController);

export default userRouter;
