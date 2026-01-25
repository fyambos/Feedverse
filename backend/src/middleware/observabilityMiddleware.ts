import type { ErrorRequestHandler, RequestHandler } from "express";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { logger } from "../lib/logger";

const nodeEnv = String(process.env.NODE_ENV ?? "").toLowerCase();

export function initSentry() {
  const dsn = String(process.env.SENTRY_DSN ?? "").trim();
  const env = String(process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "").trim() || "development";

  if (!dsn) return;
  if (String(process.env.NODE_ENV).toLowerCase() === "test") return;

  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
  const profilesSampleRate = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? "0.0");

  Sentry.init({
    dsn,
    environment: env,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    profilesSampleRate: Number.isFinite(profilesSampleRate) ? profilesSampleRate : 0.0,
  });
}

export const sentryRequestHandler: RequestHandler = (req, res, next) => {
  // Newer Sentry SDKs expose these handlers. We call via `any` to avoid version mismatch typing.
  const anySentry = Sentry as any;
  const h = anySentry?.handlers?.requestHandler?.();
  return h ? h(req, res, next) : next();
};

export const sentryTracingHandler: RequestHandler = (req, res, next) => {
  const anySentry = Sentry as any;
  const h = anySentry?.handlers?.tracingHandler?.();
  return h ? h(req, res, next) : next();
};

export const sentryErrorHandler: ErrorRequestHandler = (err: any, req: any, res: any, next: any) => {
  const anySentry = Sentry as any;
  const h = anySentry?.handlers?.errorHandler?.();
  return h ? h(err, req, res, next) : next(err);
};

export function createHttpLogger(): RequestHandler {
  const logSuccess =
    nodeEnv !== "production" || String(process.env.LOG_HTTP_SUCCESS ?? "").trim() === "1";
  const logClientErrors = String(process.env.LOG_HTTP_4XX ?? "").trim() === "1";
  const includeHeaders = String(process.env.LOG_HTTP_HEADERS ?? "").trim() === "1";

  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req as any).requestId;
      if (id) return id;
      const header = req.headers?.["x-request-id"];
      const headerStr = Array.isArray(header) ? header[0] : header;
      return headerStr ? String(headerStr) : undefined;
    },
    // NOTE: Avoid binding `userId` via `customProps`.
    // pino-http binds customProps at request start *and* again on response finish.
    // If `req.user` is populated later (after auth middleware), pino can output
    // duplicated keys (e.g. `userId:null` then `userId:"..."`) due to how it
    // concatenates child logger bindings.
    customProps: (req, _res) => ({
      requestId: (req as any).requestId ?? null,
    }),
    serializers: {
      req(req) {
        const userAgent =
          typeof (req as any)?.headers?.["user-agent"] === "string"
            ? String((req as any).headers["user-agent"])
            : undefined;

        const requestId = (req as any).requestId ?? null;
        const userId = (req as any)?.user?.id ?? null;

        const base: any = {
          id: (req as any).id,
          method: req.method,
          url: req.url,
          userAgent,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
          requestId,
          userId,
        };

        if (includeHeaders) {
          base.headers = req.headers;
        }

        return {
          ...base,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return logClientErrors ? "warn" : "silent";
      if (!logSuccess) return "silent";
      return "info";
    },
  });
}

export function tagSentryContext(): RequestHandler {
  return (req, _res, next) => {
    try {
      const rid = (req as any).requestId;
      if (rid) Sentry.setTag("requestId", String(rid));
      const uid = (req as any)?.user?.id;
      if (uid) Sentry.setUser({ id: String(uid) });
    } catch {
      // ignore
    }
    next();
  };
}

export { Sentry };
