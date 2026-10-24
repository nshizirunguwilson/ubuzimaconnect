import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { ApiError, ApiErrorCode } from "@ubuzima/shared";
import type { Response } from "express";

/** Every error the API sends has a code and a sentence the person can act on (DESIGN.md §10). */
export class ApiException extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, extra: Partial<ApiError> = {}) {
    super({ code, message, ...extra } satisfies ApiError, status);
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private log = new Logger("Error");

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof ApiException) return res.status(err.getStatus()).json(err.getResponse());
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const code: ApiErrorCode = status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "VALIDATION";
      return res.status(status).json({ code, message: err.message } satisfies ApiError);
    }
    this.log.error(err);
    return res.status(500).json({ code: "VALIDATION", message: "Something went wrong on our side. Try again." });
  }
}
