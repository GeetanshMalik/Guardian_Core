/**
 * Infrastructure: Typed Error Classes (§18.13)
 * 
 * Structured error classification with HTTP status codes.
 * Error handler middleware maps statusCode automatically.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** HTTP 400 — Incorrect user input */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

/** HTTP 401 — Invalid credentials */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

/** HTTP 403 — Permission denied */
export class AuthorizationError extends AppError {
  constructor(message = "Permission denied") {
    super(message, 403);
  }
}

/** HTTP 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`, 404);
  }
}

/** HTTP 409 — Business rule violation */
export class DomainError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** HTTP 503 — External service failure (Google APIs, Gemini, etc.) */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;

  constructor(serviceName: string, message: string) {
    super(`External service '${serviceName}' error: ${message}`, 503);
    this.serviceName = serviceName;
  }
}

/** HTTP 500 — Unexpected internal failure */
export class InternalError extends AppError {
  constructor(message = "Internal server error") {
    super(message, 500, false);
  }
}
