/**
 * API Middleware: Global Error Handler (§17.11, §18.13)
 * 
 * Maps typed error classes to HTTP status codes.
 * Catches uncaught route errors and returns structured JSON.
 */
import { Request, Response, NextFunction } from "express";
import { logger } from "../../infrastructure/logger.js";
import { AppError } from "../../infrastructure/errors.js";

export function errorHandlerMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Use typed error status codes when available
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isOperational = err instanceof AppError ? err.isOperational : false;

  logger.error("Unhandled route error", {
    error: err.message,
    statusCode,
    isOperational,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
