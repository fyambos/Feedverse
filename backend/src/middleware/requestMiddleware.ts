import type { RequestHandler } from "express";
import { randomUUID } from "crypto";

function sanitizeIncomingRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  // Prevent log/header abuse.
  if (v.length > 64) return null;
  return v;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Adds `req.requestId` + response header, and ensures error JSON responses include `requestId`.
 * Also adds an `error` field if only `message` is present (keeps `message` for backwards compat).
 */
export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const headerRaw = req.get?.("x-request-id") ?? req.get?.("X-Request-Id");
  const incoming = sanitizeIncomingRequestId(headerRaw);

  const requestId = incoming ?? randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.send = ((body: any) => {
    try {
      const status = res.statusCode;
      if (status >= 400 && isPlainObject(body)) {
        if (body.requestId == null) body.requestId = requestId;
        if (body.error == null && typeof body.message === "string" && body.message.trim()) {
          body.error = body.message;
        }
      }
    } catch {
      // ignore
    }
    return originalSend(body);
  }) as any;

  res.json = ((body: any) => {
    try {
      const status = res.statusCode;
      if (status >= 400 && isPlainObject(body)) {
        if (body.requestId == null) body.requestId = requestId;
        if (body.error == null && typeof body.message === "string" && body.message.trim()) {
          body.error = body.message;
        }
      }
    } catch {
      // ignore
    }
    return originalJson(body);
  }) as any;

  next();
};
