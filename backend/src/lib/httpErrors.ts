export type HttpErrorDetails =
  | { issues: Array<{ path: string; message: string }> }
  | Record<string, unknown>;

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly details?: HttpErrorDetails;

  constructor(statusCode: number, message: string, details?: HttpErrorDetails) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
