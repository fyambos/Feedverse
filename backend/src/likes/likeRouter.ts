import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { SetPostLikeController } from "./likeControllers";

const likeRouter = Router();

// Acts on a post id. Client should provide { scenarioId, profileId }.
likeRouter.post("/posts/:id", authMiddleware, SetPostLikeController);
likeRouter.delete("/posts/:id", authMiddleware, SetPostLikeController);

export default likeRouter;
