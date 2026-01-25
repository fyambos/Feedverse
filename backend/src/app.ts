import express from "express";
import bodyParser from "body-parser";
import authRouter from "./auth/authRouter";
import userRouter from "./users/userRouter";
import scenarioRouter from "./scenarios/scenarioRouter";
import profileRouter from "./profiles/profileRouter";
import postRouter from "./posts/postRouter";
import repostRouter from "./reposts/repostRouter";
import likeRouter from "./likes/likeRouter";
import globalTagRouter from "./globalTags/globalTagRouter";
import { conversationRouter } from "./conversations/conversationRoutes";
import { messageRouter } from "./messages/messageRoutes";
import { realtimeRouter } from "./realtime/realtimeRoutes";
import { ROUTES_AUTH, ROUTES_USERS } from "./config/constants";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware";
import { requestContextMiddleware } from "./middleware/requestMiddleware";
import { createCorsMiddleware, createRateLimitMiddleware, helmetMiddleware } from "./middleware/securityMiddleware";
import {
  createHttpLogger,
  initSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  sentryTracingHandler,
  tagSentryContext,
} from "./middleware/observabilityMiddleware";
import { dbPing } from "./config/database";

export function createApp() {
  const app = express();

  initSentry();

  // If behind a proxy (Railway/Render/Nginx), set TRUST_PROXY=1 so rate limiting uses real client IPs.
  if (String(process.env.TRUST_PROXY ?? "").trim()) {
    app.set("trust proxy", process.env.TRUST_PROXY);
  }

  app.use(requestContextMiddleware);

  // Sentry request + performance tracing
  app.use(sentryRequestHandler);
  app.use(sentryTracingHandler);
  app.use(tagSentryContext());

  // Security middleware
  app.use(helmetMiddleware);
  app.use(createCorsMiddleware());
  app.use(createRateLimitMiddleware());

  // Request size limits (JSON + urlencoded)
  const bodyLimit = String(process.env.BODY_SIZE_LIMIT ?? "1mb");
  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));

  // Structured request/response logging
  app.use(createHttpLogger());

  // API version header (default v1).
  app.use((_req, res, next) => {
    res.setHeader("X-API-Version", "1");
    next();
  });

  // Health checks (no auth)
  app.get("/healthz", async (_req, res) => {
    const db = await dbPing({ timeoutMs: 1500 });
    return res.status(200).json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      db,
    });
  });

  // Readiness: return 503 if DB is unavailable
  app.get("/readyz", async (_req, res) => {
    const db = await dbPing({ timeoutMs: 1500 });
    if (!db.ok) {
      return res.status(503).json({ ok: false, uptimeSec: Math.round(process.uptime()), db });
    }
    return res.status(200).json({ ok: true, uptimeSec: Math.round(process.uptime()), db });
  });

  const mountRoutes = (router: any) => {
    router.use(ROUTES_AUTH.BASE, authRouter);
    router.use(ROUTES_USERS.BASE, userRouter);
    router.use("/scenarios", scenarioRouter);
    router.use("/profiles", profileRouter);
    router.use("/posts", postRouter);
    router.use("/reposts", repostRouter);
    router.use("/likes", likeRouter);
    router.use("/global-tags", globalTagRouter);
    router.use(conversationRouter);
    router.use(messageRouter);
    router.use(realtimeRouter);
  };

  // Unversioned (current) routes
  mountRoutes(app);

  // Versioned routes (non-breaking strategy)
  const v1 = express.Router();
  mountRoutes(v1);
  app.use("/v1", v1);

  // Final handlers
  app.use(notFoundHandler);
  // Sentry error capture must run before our final error formatter.
  app.use(sentryErrorHandler);
  app.use(errorHandler);

  return app;
}

export default createApp();
