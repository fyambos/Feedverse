import { Router } from "express";
const userRouter = Router();

import { GetUserProfileController } from "./userControllers";
import { authMiddleware } from "../auth/authMiddleware";
import { ROUTES_USERS } from "../config/constants";

userRouter.get(ROUTES_USERS.PROFILE, authMiddleware, GetUserProfileController);

export default userRouter;
