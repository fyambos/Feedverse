import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { upload } from "../config/multer";
import {
	AdoptProfileController,
	DeleteProfileController,
	UpdateProfileAvatarController,
	UpdateProfileController,
	UpdateProfileHeaderController,
} from "./profileControllers";
import {
	GetProfileCharacterSheetController,
	PutProfileCharacterSheetController,
} from "../characterSheets/characterSheetControllers";
import { PutProfilePinnedPostController } from "../profilePins/profilePinControllers";

const profileRouter = Router();

profileRouter.patch("/:id", authMiddleware, UpdateProfileController);
profileRouter.delete("/:id", authMiddleware, DeleteProfileController);
profileRouter.post("/:id/adopt", authMiddleware, AdoptProfileController);

profileRouter.get("/:id/character-sheet", authMiddleware, GetProfileCharacterSheetController);
profileRouter.put("/:id/character-sheet", authMiddleware, PutProfileCharacterSheetController);

profileRouter.put("/:id/pinned-post", authMiddleware, PutProfilePinnedPostController);

profileRouter.post("/:id/avatar", authMiddleware, upload.single("avatar"), UpdateProfileAvatarController);
profileRouter.post("/:id/header", authMiddleware, upload.single("header"), UpdateProfileHeaderController);

export default profileRouter;
