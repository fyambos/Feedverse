import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import { ListGlobalTagsController } from "./globalTagControllers";

const globalTagRouter = Router();

globalTagRouter.get("/", authMiddleware, ListGlobalTagsController);

export default globalTagRouter;
