import { Router } from "express";
const scenarioRouter = Router();

import {
  CreateScenarioController,
  GetScenarioByIdController,
  UpdateScenarioController,
  DeleteScenarioController,
  GetScenarioPlayersController,
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
scenarioRouter.patch(
  ROUTES_SCENARIOS.BY_ID,
  authMiddleware,
  UpdateScenarioController,
);
scenarioRouter.get(
  ROUTES_SCENARIOS.BY_ID + ROUTES_SCENARIOS.PLAYERS,
  authMiddleware,
  GetScenarioPlayersController,
);

export default scenarioRouter;
