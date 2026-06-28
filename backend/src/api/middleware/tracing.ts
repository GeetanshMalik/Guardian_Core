/**
 * API Middleware: Request Tracing (§17.13 Observability)
 * 
 * Injects requestId, correlationId into AsyncLocalStorage
 * and attaches them to response headers for client-side correlation.
 */
import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { runWithRequestContext } from "../../infrastructure/requestContext.js";
import { metricsRegistry } from "../../infrastructure/metrics.js";

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID();
  const correlationId = (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  const startTime = Date.now();

  // Attach tracing headers to the response
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-correlation-id", correlationId);

  // Hook into response finish to capture request duration and outcomes
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    // Exclude health/metrics check endpoints from metrics volume to prevent noise
    if (req.path !== "/health" && req.path !== "/metrics") {
      metricsRegistry.recordApiCall(req.path, req.method, res.statusCode, durationMs);
    }
  });

  runWithRequestContext(
    {
      requestId,
      correlationId,
      startTime,
    },
    () => next()
  );
}
