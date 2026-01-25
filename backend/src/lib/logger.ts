import pino from "pino";

const nodeEnv = String(process.env.NODE_ENV ?? "").toLowerCase();

const level =
  String(process.env.LOG_LEVEL ?? "").trim() ||
  (nodeEnv === "production" ? "info" : nodeEnv === "test" ? "silent" : "debug");

const usePretty =
  nodeEnv !== "production" &&
  nodeEnv !== "test" &&
  String(process.env.LOG_PRETTY ?? "1").trim() !== "0";

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.set-cookie",
      "req.headers[\"x-api-key\"]",
      "req.body.password",
      "req.body.password_hash",
      "req.body.token",
    ],
    remove: true,
  },
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      }
    : undefined,
});
