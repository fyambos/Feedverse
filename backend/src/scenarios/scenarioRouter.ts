import { Router } from "express";
const scenarioRouter = Router();

import { CreateScenarioController } from "./scenarioControllers";
import { ROUTES_SCENARIOS } from "../config/constants";
import { authMiddleware } from "../auth/authMiddleware";

scenarioRouter.post(
  ROUTES_SCENARIOS.CREATE,
  authMiddleware,
  CreateScenarioController,
);

export default scenarioRouter;
