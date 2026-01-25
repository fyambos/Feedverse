import type { RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpErrors";

function zodIssues(e: z.ZodError) {
  return e.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
}

type AnyZod = z.ZodTypeAny;

export function validateBody<T extends AnyZod>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "Invalid request", { issues: zodIssues(parsed.error) }));
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T extends AnyZod>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "Invalid request", { issues: zodIssues(parsed.error) }));
    }
    // Express 5's Request.query may be a getter-only property depending on the router layer.
    // Avoid assigning to it; store the validated/coerced result separately.
    (req as any).validatedQuery = parsed.data;
    next();
  };
}

export function validateParams<T extends AnyZod>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "Invalid request", { issues: zodIssues(parsed.error) }));
    }
    // Keep the same object reference; some routers treat params as special.
    try {
      Object.assign(req.params as any, parsed.data);
    } catch {
      (req as any).validatedParams = parsed.data;
    }
    next();
  };
}
