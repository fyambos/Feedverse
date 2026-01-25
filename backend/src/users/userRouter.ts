import { Router } from "express";
const userRouter = Router();

import { GetUserProfileController, UpdateUserAvatarController, GetUsersByIdsController, UpdateUsernameController, UpsertUserPushTokenController, DeleteUserPushTokenController } from "./userControllers";
import { authMiddleware } from "../auth/authMiddleware";
import { ROUTES_USERS } from "../config/constants";
import { upload } from "../config/multer";
import { ListSessionsController, LogoutOtherSessionsController } from "../sessions/sessionControllers";
import { z } from "zod";
import { validateBody } from "../middleware/validationMiddleware";

userRouter.get(ROUTES_USERS.PROFILE, authMiddleware, GetUserProfileController);

// Fetch multiple users by id (query param `ids=uuid1,uuid2`)
userRouter.get("/", authMiddleware, GetUsersByIdsController);

// Upload avatar image to Cloudflare R2 and store its public URL in the DB
userRouter.post("/avatar", authMiddleware, upload.single("avatar"), UpdateUserAvatarController);

// PATCH /username - update username
userRouter.patch(
	"/username",
	authMiddleware,
	validateBody(z.object({ username: z.string().trim().min(3) }).passthrough()),
	UpdateUsernameController,
);

// POST /push-token - register Expo push token for remote notifications
userRouter.post(
	"/push-token",
	authMiddleware,
	validateBody(
		z
			.object({
				expoPushToken: z.string().trim().min(1),
				platform: z.string().trim().min(1).optional(),
				expo_push_token: z.string().trim().min(1).optional(),
			})
			.passthrough()
			.transform((v) => ({
				...v,
				// Normalize snake_case to camelCase if present.
				expoPushToken: String((v as any).expoPushToken ?? (v as any).expo_push_token ?? "").trim(),
			})),
	),
	UpsertUserPushTokenController,
);

// DELETE /push-token - revoke token(s) for this user (used on logout)
userRouter.delete("/push-token", authMiddleware, DeleteUserPushTokenController);

// GET /users/sessions - list active sessions (current + other)
userRouter.get("/sessions", authMiddleware, ListSessionsController);

// POST /users/sessions/logout-others - revoke all other active sessions
userRouter.post("/sessions/logout-others", authMiddleware, LogoutOtherSessionsController);

export default userRouter;
