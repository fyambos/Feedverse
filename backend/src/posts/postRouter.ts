import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { DeletePostController, UpdatePostController, UploadPostImagesController } from "./postControllers";
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
postRouter.delete("/:id", authMiddleware, validateParams(idParamSchema), DeletePostController);

export default postRouter;
