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
import { requestContextMiddleware, requestLoggerMiddleware } from "./middleware/requestMiddleware";
import { createCorsMiddleware, createRateLimitMiddleware, helmetMiddleware } from "./middleware/securityMiddleware";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception", err);
});

const app = express();

// If behind a proxy (Railway/Render/Nginx), set TRUST_PROXY=1 so rate limiting uses real client IPs.
if (String(process.env.TRUST_PROXY ?? "").trim()) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}

app.use(requestContextMiddleware);

// Security middleware
app.use(helmetMiddleware);
app.use(createCorsMiddleware());
app.use(createRateLimitMiddleware());

// Request size limits (JSON + urlencoded)
const bodyLimit = String(process.env.BODY_SIZE_LIMIT ?? "1mb");
app.use(bodyParser.json({ limit: bodyLimit }));
app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));

app.use(requestLoggerMiddleware);

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
app.use(errorHandler);

const AppStart = async () => {
  console.log(
    `L'application est lançée à l'adresse : ${APP_CONFIG.ENVIRONMENT}:${APP_CONFIG.SERVER_PORT}`,
  );
};

const server = http.createServer(app);
server.listen(APP_CONFIG.SERVER_PORT, AppStart);

// Attach WebSocket server for realtime in production.
import websocketService from "./realtime/websocketService";
try {
  websocketService.attachWebSocketServer(server as any);
} catch (e) {
  console.log("Failed to attach websocket server", e);
}

export default app;
