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

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
