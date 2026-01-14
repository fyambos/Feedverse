import { Router } from "express";
const scenarioRouter = Router();

import {
  CreateScenarioController,
  GetScenarioByIdController,
  DeleteScenarioController,
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
scenarioRouter.delete(
  ROUTES_SCENARIOS.BY_ID,
  authMiddleware,
  DeleteScenarioController,
);

export default scenarioRouter;
