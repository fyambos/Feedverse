import type { ErrorRequestHandler, RequestHandler } from "express";
import { ERROR_MESSAGES, HTTP_STATUS } from "../config/constants";
import { logger } from "../lib/logger";

function isPgLikeError(err: unknown): err is { code?: unknown } {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as any).code === "string" &&
    String((err as any).code).length === 5
  );
}

function isBodyParserSyntaxError(err: unknown): err is SyntaxError & { status?: number } {
  // body-parser throws a SyntaxError with status=400 and a "body" property when JSON is invalid.
  return (
    err instanceof SyntaxError &&
    typeof (err as any)?.status === "number" &&
    (err as any).status === 400 &&
    "body" in (err as any)
  );
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: "Not found",
    path: req.originalUrl,
    requestId: req.requestId ?? null,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Default: hide internal details.
  let status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let errorMessage: string = ERROR_MESSAGES.INTERNAL_SERVER_ERROR;

  if (isBodyParserSyntaxError(err)) {
    status = HTTP_STATUS.BAD_REQUEST;
    errorMessage = ERROR_MESSAGES.INVALID_REQUEST;
  } else if (isPgLikeError(err)) {
    status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    errorMessage = ERROR_MESSAGES.DATABASE_ERROR;
  } else if (typeof (err as any)?.statusCode === "number") {
    // Allow upstream middleware to set an explicit statusCode.
    status = (err as any).statusCode;
  } else if (typeof (err as any)?.status === "number") {
    status = (err as any).status;
  }

  // Log the full error server-side; never leak raw details to clients.
  logger.error({ err, method: req.method, path: req.originalUrl, status, requestId: req.requestId ?? null }, "Unhandled error");

  res.status(status).json({
    error: errorMessage,
    requestId: req.requestId ?? null,
  });
};
