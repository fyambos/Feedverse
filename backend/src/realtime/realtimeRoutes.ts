import { Router } from "express";
import { authMiddleware } from "../auth/authMiddleware";
import realtimeService from "./realtimeService";

export const realtimeRouter = Router();

realtimeRouter.get("/scenarios/:scenarioId/events", authMiddleware, (req, res) => {
  const scenarioId = String(req.params.scenarioId ?? "");
  if (!scenarioId) return res.status(400).end();

  // Subscribe this response to scenario events (SSE)
  realtimeService.subscribeScenarioEvents(scenarioId, res);
});

export default realtimeRouter;
