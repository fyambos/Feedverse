import http from "http";
import { APP_CONFIG } from "./config/constants";
import { logger } from "./lib/logger";
import { waitForDatabaseReady } from "./config/database";
import { attachWebSocketServer } from "./realtime/websocketService";
import app from "./app";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
});

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
