import type { Request, Response } from "express";
import { ERROR_MESSAGES, HTTP_STATUS } from "../config/constants";

export function sendError(
  req: Request,
  res: Response,
  status: number,
  error: string,
  details?: unknown,
) {
  const payload: any = {
    ok: false,
    status,
    error,
    path: req.originalUrl,
    requestId: req.requestId ?? null,
  };
  if (details != null) payload.details = details;
  return res.status(status).json(payload);
}

export function sendMethodNotAllowed(req: Request, res: Response) {
  return sendError(req, res, HTTP_STATUS.METHOD_NOT_ALLOWED, ERROR_MESSAGES.METHOD_NOT_ALLOWED);
}
