import type { ErrorRequestHandler, RequestHandler } from "express";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { logger } from "../lib/logger";

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
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req as any).requestId;
      if (id) return id;
      const header = req.headers?.["x-request-id"];
      const headerStr = Array.isArray(header) ? header[0] : header;
      return headerStr ? String(headerStr) : undefined;
    },
    customProps: (req, res) => ({
      requestId: (req as any).requestId ?? null,
      userId: (req as any)?.user?.id ?? null,
    }),
    serializers: {
      req(req) {
        return {
          id: (req as any).id,
          method: req.method,
          url: req.url,
          headers: req.headers,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
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
