import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { JoinScenarioByInviteCodeController, ListScenariosController } from "./scenarioControllers";
import {
	CreateScenarioController,
	DeleteScenarioController,
	LeaveScenarioController,
	TransferScenarioOwnershipController,
	UpdateScenarioController,
	UploadScenarioCoverController,
} from "./scenarioControllers";
import { upload } from "../config/multer";
import {
	CreateScenarioProfileController,
	ListScenarioProfilesController,
	TransferProfilesController,
} from "../profiles/profileControllers";
import {
	CreateScenarioPostController,
	GetScenarioPostThreadController,
	ListScenarioPostsController,
} from "../posts/postControllers";
import { ListScenarioRepostsController } from "../reposts/repostControllers";
import { ListScenarioLikesController } from "../likes/likeControllers";
import { ListScenarioCharacterSheetsController } from "../characterSheets/characterSheetControllers";
import { ListScenarioProfilePinsController } from "../profilePins/profilePinControllers";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validationMiddleware";
import { requireScenarioMember, requireScenarioOwner } from "../middleware/scenarioScopeMiddleware";
import {
	GetScenarioNotificationPrefsController,
	PutScenarioNotificationPrefsController,
} from "../notifications/scenarioNotificationPrefsControllers";

const scenarioRouter = Router();

const idParamSchema = z.object({ id: z.string().uuid() }).passthrough();
const threadParamSchema = z.object({ id: z.string().uuid(), postId: z.string().trim().min(1) }).passthrough();

scenarioRouter.get("/", authMiddleware, ListScenariosController);
scenarioRouter.post(
	"/join",
	authMiddleware,
	validateBody(
		z
			.object({
				inviteCode: z.string().trim().min(1).optional(),
				invite_code: z.string().trim().min(1).optional(),
			})
			.passthrough(),
	),
	JoinScenarioByInviteCodeController,
);
scenarioRouter.post(
	"/",
	authMiddleware,
	validateBody(
		z
			.object({
				name: z.string().trim().min(1),
				cover: z.string().trim().optional(),
				cover_url: z.string().trim().optional(),
				inviteCode: z.string().trim().optional(),
				invite_code: z.string().trim().optional(),
				description: z.union([z.string(), z.null()]).optional(),
				mode: z.string().trim().optional(),
				settings: z.any().optional(),
				gmUserIds: z.array(z.string().uuid()).optional(),
				tags: z.array(z.string()).optional(),
			})
			.passthrough(),
	),
	CreateScenarioController,
);
scenarioRouter.post(
	"/:id/profiles",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	CreateScenarioProfileController,
);
scenarioRouter.get(
	"/:id/profiles",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	ListScenarioProfilesController,
);
scenarioRouter.post(
	"/:id/transfer-profiles",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	TransferProfilesController,
);
scenarioRouter.get(
	"/:id/posts",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	validateQuery(
		z
			.object({
				limit: z.coerce.number().int().min(1).max(500).optional(),
				cursor: z.string().optional(),
			})
			.passthrough(),
	),
	ListScenarioPostsController,
);

scenarioRouter.get(
	"/:id/posts/:postId/thread",
	authMiddleware,
	validateParams(threadParamSchema),
	requireScenarioMember(),
	GetScenarioPostThreadController,
);
scenarioRouter.post(
	"/:id/posts",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	validateBody(
		z
			.object({
				authorProfileId: z.string().uuid().optional(),
				author_profile_id: z.string().uuid().optional(),
				text: z.string().optional(),
				imageUrls: z.array(z.string()).optional(),
				image_urls: z.array(z.string()).optional(),
					parentPostId: z.string().trim().min(1).nullable().optional(),
					parent_post_id: z.string().trim().min(1).nullable().optional(),
					quotedPostId: z.string().trim().min(1).nullable().optional(),
					quoted_post_id: z.string().trim().min(1).nullable().optional(),
				postType: z.string().optional(),
				post_type: z.string().optional(),
				meta: z.any().optional(),
			})
			.passthrough(),
	),
	CreateScenarioPostController,
);
scenarioRouter.get(
	"/:id/reposts",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	ListScenarioRepostsController,
);
scenarioRouter.get(
	"/:id/likes",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	ListScenarioLikesController,
);
scenarioRouter.get(
	"/:id/character-sheets",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	ListScenarioCharacterSheetsController,
);
scenarioRouter.get(
	"/:id/profile-pins",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	ListScenarioProfilePinsController,
);

// Per-user notification preferences for this scenario
scenarioRouter.get(
	"/:id/notification-prefs",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	GetScenarioNotificationPrefsController,
);
scenarioRouter.put(
	"/:id/notification-prefs",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	validateBody(z.object({}).passthrough()),
	PutScenarioNotificationPrefsController,
);
scenarioRouter.patch(
	"/:id",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioOwner(),
	validateBody(z.object({}).passthrough()),
	UpdateScenarioController,
);
scenarioRouter.delete(
	"/:id",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioOwner(),
	DeleteScenarioController,
);
scenarioRouter.post(
	"/:id/leave",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioMember(),
	LeaveScenarioController,
);
scenarioRouter.post(
	"/:id/transfer-ownership",
	authMiddleware,
	validateParams(idParamSchema),
	requireScenarioOwner(),
	validateBody(
		z
			.object({
				toUserId: z.string().uuid().optional(),
				to_user_id: z.string().uuid().optional(),
			})
			.passthrough(),
	),
	TransferScenarioOwnershipController,
);
scenarioRouter.post(
  "/:id/cover",
  authMiddleware,
  validateParams(idParamSchema),
  requireScenarioOwner(),
  upload.single("cover"),
  UploadScenarioCoverController,
);


export default scenarioRouter;
