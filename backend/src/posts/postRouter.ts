import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { DeletePostController, UpdatePostController, UploadPostImagesController } from "./postControllers";

const postRouter = Router();

postRouter.patch("/:id", authMiddleware, UpdatePostController);
postRouter.post("/:id/images", authMiddleware, UploadPostImagesController);
postRouter.delete("/:id", authMiddleware, DeletePostController);

export default postRouter;
