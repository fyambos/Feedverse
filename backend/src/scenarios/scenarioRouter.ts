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
	ListScenarioPostsController,
} from "../posts/postControllers";
import { ListScenarioRepostsController } from "../reposts/repostControllers";
import { ListScenarioLikesController } from "../likes/likeControllers";
import { ListScenarioCharacterSheetsController } from "../characterSheets/characterSheetControllers";

const scenarioRouter = Router();

scenarioRouter.get("/", authMiddleware, ListScenariosController);
scenarioRouter.post("/join", authMiddleware, JoinScenarioByInviteCodeController);
scenarioRouter.post("/", authMiddleware, CreateScenarioController);
scenarioRouter.get("/:id/profiles", authMiddleware, ListScenarioProfilesController);
scenarioRouter.post("/:id/profiles", authMiddleware, CreateScenarioProfileController);
scenarioRouter.post("/:id/transfer-profiles", authMiddleware, TransferProfilesController);
scenarioRouter.get("/:id/posts", authMiddleware, ListScenarioPostsController);
scenarioRouter.post("/:id/posts", authMiddleware, CreateScenarioPostController);
scenarioRouter.get("/:id/reposts", authMiddleware, ListScenarioRepostsController);
scenarioRouter.get("/:id/likes", authMiddleware, ListScenarioLikesController);
scenarioRouter.get("/:id/character-sheets", authMiddleware, ListScenarioCharacterSheetsController);
scenarioRouter.patch("/:id", authMiddleware, UpdateScenarioController);
scenarioRouter.delete("/:id", authMiddleware, DeleteScenarioController);
scenarioRouter.post("/:id/leave", authMiddleware, LeaveScenarioController);
scenarioRouter.post(
	"/:id/transfer-ownership",
	authMiddleware,
	TransferScenarioOwnershipController,
);
scenarioRouter.post("/:id/cover", authMiddleware, upload.single("cover"), UploadScenarioCoverController);


export default scenarioRouter;
