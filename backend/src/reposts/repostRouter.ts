import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { TogglePostRepostController } from "./repostControllers";

const repostRouter = Router();

// Acts on a post id. Client should provide { scenarioId, profileId }.
repostRouter.post("/posts/:id", authMiddleware, TogglePostRepostController);
repostRouter.delete("/posts/:id", authMiddleware, TogglePostRepostController);

export default repostRouter;
