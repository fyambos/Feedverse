import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import { APP_CONFIG, HTTP_STATUS } from "../config/constants";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isProd() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

export function createCorsMiddleware(): RequestHandler {
  const allowlist = parseOrigins(process.env.CORS_ORIGINS);

  return cors({
    origin: (origin, callback) => {
      // Non-browser clients (mobile native, curl) typically send no Origin.
      if (!origin) return callback(null, true);

      // In dev/test, be permissive unless an allowlist is explicitly provided.
      if (!isProd() && allowlist.length === 0) return callback(null, true);

      if (allowlist.length > 0 && allowlist.includes(origin)) return callback(null, true);

      // Do not throw: just omit CORS headers so browsers block the response.
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 86400,
  });
}

export const helmetMiddleware: RequestHandler = helmet({
  // API server; CSP is usually managed at a frontend/CDN layer.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

export function createRateLimitMiddleware(): RequestHandler {
  // Avoid flakiness in tests.
  if (String(process.env.NODE_ENV).toLowerCase() === "test") {
    return (_req, _res, next) => next();
  }

  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? APP_CONFIG.RATE_LIMIT_WINDOW_MS);
  const max = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? APP_CONFIG.RATE_LIMIT_MAX_REQUESTS);

  return rateLimit({
    windowMs: Number.isFinite(windowMs) ? windowMs : APP_CONFIG.RATE_LIMIT_WINDOW_MS,
    max: Number.isFinite(max) ? max : APP_CONFIG.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Prefer user-bound limits when authenticated, else fall back to IP.
      // Also partition by endpoint group so one noisy endpoint doesn't block others.
      const userId = (req as any)?.user?.id ? String((req as any).user.id) : "";
      const ip = String((req as any).ip ?? "");
      const principal = userId ? `u:${userId}` : `ip:${ipKeyGenerator(ip)}`;

      // At app-level middleware, baseUrl is usually empty, so derive group from the URL path.
      const rawUrl = String((req as any).originalUrl ?? req.url ?? req.path ?? "");
      const pathname = rawUrl.split("?")[0] || "/";
      const firstSeg = pathname.split("/").filter(Boolean)[0];
      const group = firstSeg ? `/${firstSeg}` : "/";

      return `${principal}|${req.method}|${group}`;
    },
    message: {
      error: "Too many requests",
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
    },
  });
}
