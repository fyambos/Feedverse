import { Router } from "express";
const scenarioRouter = Router();

import {
  CreateScenarioController,
  GetScenarioByIdController,
} from "./scenarioControllers";
import { ROUTES_SCENARIOS } from "../config/constants";
import { authMiddleware } from "../auth/authMiddleware";

scenarioRouter.post(
  ROUTES_SCENARIOS.CREATE,
  authMiddleware,
  CreateScenarioController,
);
scenarioRouter.get(
  ROUTES_SCENARIOS.BY_ID,
  authMiddleware,
  GetScenarioByIdController,
);

export default scenarioRouter;
