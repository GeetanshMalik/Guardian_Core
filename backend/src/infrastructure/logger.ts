/**
 * Infrastructure: Structured Logger
 * JSON-formatted logging with automatic request context injection (§17.13 Observability)
 */
import { getRequestContext } from "./requestContext.js";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  correlationId?: string;
  userId?: string;
  goalId?: string;
  decisionId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function buildEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  const ctx = getRequestContext();
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (ctx) {
    entry.requestId = ctx.requestId;
    entry.correlationId = ctx.correlationId;
    entry.userId = ctx.userId;
    entry.goalId = ctx.goalId;
    entry.decisionId = ctx.decisionId;
    entry.durationMs = Date.now() - ctx.startTime;
    if ((ctx as any).spanId) {
      entry.spanId = (ctx as any).spanId;
    }
    if ((ctx as any).parentSpanId) {
      entry.parentSpanId = (ctx as any).parentSpanId;
    }
  }

  if (meta) {
    Object.assign(entry, meta);
  }

  return entry;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    const entry = buildEntry("info", message, meta);
    console.log(JSON.stringify(entry));
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    const entry = buildEntry("warn", message, meta);
    console.warn(JSON.stringify(entry));
  },

  error(message: string, meta?: Record<string, unknown>): void {
    const entry = buildEntry("error", message, meta);
    console.error(JSON.stringify(entry));
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      const entry = buildEntry("debug", message, meta);
      console.log(JSON.stringify(entry));
    }
  },
};
