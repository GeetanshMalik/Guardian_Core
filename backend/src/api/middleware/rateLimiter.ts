import rateLimit from "express-rate-limit";

/**
 * Conversation API Rate Limiter
 * 60 requests per minute
 */
export const conversationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many conversation requests. Limits: 60 requests/minute."
    }
  }
});

/**
 * Goal Operations Rate Limiter
 * 30 requests per minute
 */
export const goalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many goal operations. Limits: 30 requests/minute."
    }
  }
});

/**
 * Authentication Rate Limiter
 * 10 attempts per minute
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Limits: 10 attempts/minute."
    }
  }
});
