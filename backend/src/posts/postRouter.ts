import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { DeletePostController, ReportPostController, UpdatePostController, UploadPostImagesController } from "./postControllers";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validationMiddleware";

const postRouter = Router();

// Post IDs are stored as text (not UUID) to support client-generated IDs.
const idParamSchema = z
	.object({ id: z.string().trim().min(1) })
	.passthrough();

postRouter.patch(
	"/:id",
	authMiddleware,
	validateParams(idParamSchema),
	validateBody(z.object({}).passthrough()),
	UpdatePostController,
);
postRouter.post("/:id/images", authMiddleware, validateParams(idParamSchema), UploadPostImagesController);
postRouter.post(
	"/:id/report",
	authMiddleware,
	validateParams(idParamSchema),
	validateBody(
		z
			.object({
				message: z.string().trim().max(2000).optional(),
			})
			.passthrough(),
	),
	ReportPostController,
);
postRouter.delete("/:id", authMiddleware, validateParams(idParamSchema), DeletePostController);

export default postRouter;
