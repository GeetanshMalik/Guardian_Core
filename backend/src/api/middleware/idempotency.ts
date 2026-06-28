import { Request, Response, NextFunction } from "express";
import { getIdempotencyEntry, saveIdempotencyEntry } from "../../db.js";

/**
 * Idempotency Key Middleware (§22.21)
 * Guarantees that mutating endpoints (POST, PATCH, PUT) do not execute twice 
 * if submitted with the same Idempotency-Key header.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to mutating methods
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT") {
    return next();
  }

  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key) {
    return next();
  }

  try {
    // Check if key already processed
    const cached = await getIdempotencyEntry(key);
    if (cached) {
      console.log(`[Idempotency] Duplicate submission detected for key: "${key}". Returning cached response.`);
      res.setHeader("x-idempotency-cache", "HIT");
      return res.status(cached.statusCode).json(cached.responseBody);
    }

    // Intercept response writing to cache it
    const originalJson = res.json;
    res.json = function (body: any): Response {
      // Re-enable json method
      res.json = originalJson;
      
      // Save response body asynchronously
      saveIdempotencyEntry({
        id: key,
        statusCode: res.statusCode,
        responseBody: body,
        timestamp: new Date().toISOString()
      }).catch(err => console.error(`[Idempotency] Failed to cache response for key "${key}":`, err));

      return originalJson.call(this, body);
    };

    next();
  } catch (err) {
    next(err);
  }
}
