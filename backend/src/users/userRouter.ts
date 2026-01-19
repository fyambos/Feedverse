import { Router } from "express";
const userRouter = Router();

import { GetUserProfileController, UpdateUserAvatarController, GetUsersByIdsController, UpdateUsernameController, UpsertUserPushTokenController } from "./userControllers";
import { authMiddleware } from "../auth/authMiddleware";
import { ROUTES_USERS } from "../config/constants";
import { upload } from "../config/multer";
import { ListSessionsController, LogoutOtherSessionsController } from "../sessions/sessionControllers";

userRouter.get(ROUTES_USERS.PROFILE, authMiddleware, GetUserProfileController);

// Fetch multiple users by id (query param `ids=uuid1,uuid2`)
userRouter.get("/", authMiddleware, GetUsersByIdsController);

// Upload avatar image to Cloudflare R2 and store its public URL in the DB
userRouter.post("/avatar", authMiddleware, upload.single("avatar"), UpdateUserAvatarController);

// PATCH /username - update username
userRouter.patch("/username", authMiddleware, UpdateUsernameController);

// POST /push-token - register Expo push token for remote notifications
userRouter.post("/push-token", authMiddleware, UpsertUserPushTokenController);

// GET /users/sessions - list active sessions (current + other)
userRouter.get("/sessions", authMiddleware, ListSessionsController);

// POST /users/sessions/logout-others - revoke all other active sessions
userRouter.post("/sessions/logout-others", authMiddleware, LogoutOtherSessionsController);

export default userRouter;
