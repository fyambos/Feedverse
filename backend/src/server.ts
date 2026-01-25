import express from "express";
import http from "http";
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
import { APP_CONFIG } from "./config/constants";
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
import { logger } from "./lib/logger";
import { dbPing, waitForDatabaseReady } from "./config/database";
import { attachWebSocketServer } from "./realtime/websocketService";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
});

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

app.use(ROUTES_AUTH.BASE, authRouter);
app.use(ROUTES_USERS.BASE, userRouter);
app.use("/scenarios", scenarioRouter);
app.use("/profiles", profileRouter);
app.use("/posts", postRouter);
app.use("/reposts", repostRouter);
app.use("/likes", likeRouter);
app.use("/global-tags", globalTagRouter);
app.use(conversationRouter);
app.use(messageRouter);
app.use(realtimeRouter);

// Final handlers
app.use(notFoundHandler);
// Sentry error capture must run before our final error formatter.
app.use(sentryErrorHandler);
app.use(errorHandler);

const startServer = async () => {
  const dbReady = await waitForDatabaseReady();
  if (!dbReady.ok) {
    logger.error({ dbReady }, "Database not ready after retries");
  }

  const server = http.createServer(app);
  server.listen(APP_CONFIG.SERVER_PORT, () => {
    logger.info(
      { env: APP_CONFIG.ENVIRONMENT, port: APP_CONFIG.SERVER_PORT, dbReady },
      "Backend listening",
    );
  });

  // Attach WebSocket server for realtime in production.
  // (Attach after HTTP server exists.)
  try {
    attachWebSocketServer(server);
  } catch (e) {
    logger.warn({ err: e }, "Failed to attach websocket server");
  }
};

void startServer();

export default app;
