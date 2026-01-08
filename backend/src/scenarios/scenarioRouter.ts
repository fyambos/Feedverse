import { Router } from "express";
const scenarioRouter = Router();

import { CreateScenarioController } from "./scenarioControllers";
import { ROUTES_SCENARIOS } from "../config/constants";

scenarioRouter.post(ROUTES_SCENARIOS.CREATE, CreateScenarioController);

export default scenarioRouter;
