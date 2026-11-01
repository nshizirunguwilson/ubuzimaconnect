import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { ApiError, ApiErrorCode } from "@ubuzima/shared";
import type { Response } from "express";

/** An error with a code for the web app and a sentence the person can act on. */
export class ApiException extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, extra: Partial<ApiError> = {}) {
    super({ code, message, ...extra } satisfies ApiError, status);
  }
}

/** The error code for one of Nest's own HTTP errors. */
function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "VALIDATION";
}

/** Turns every error into the same JSON shape. Unexpected errors are logged and never shown in detail. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private log = new Logger("Error");

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof ApiException) {
      return response.status(error.getStatus()).json(error.getResponse());
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body: ApiError = { code: codeForStatus(status), message: error.message };
      return response.status(status).json(body);
    }

    this.log.error(error);
    return response.status(500).json({ code: "VALIDATION", message: "Something went wrong on our side. Try again." });
  }
}
