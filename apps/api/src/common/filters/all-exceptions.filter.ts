import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Turns every thrown error into the one response shape the frontend parses:
 * `{ error: string }`.
 *
 * Unknown errors are logged with their stack and reported as a generic 500 —
 * an upstream provider's error text can carry API keys or internal URLs, and
 * that must not reach the browser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({ error: messageOf(exception) });
      return;
    }

    this.logger.error(
      `Unhandled error on ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong. Please try again." });
  }
}

/** Nest wraps validation errors in `{ message: string | string[] }`. Flatten it. */
function messageOf(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === "string") return body;

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.length > 0) return String(message[0]);

  return exception.message;
}
