/**
 * Infrastructure: Request Context using AsyncLocalStorage
 * Provides request-scoped tracing identifiers (§17.13 Observability)
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  goalId?: string;
  decisionId?: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Creates and runs a new request context scope.
 */
export function runWithRequestContext<T>(
  ctx: Partial<RequestContext>,
  fn: () => T
): T {
  const fullCtx: RequestContext = {
    requestId: ctx.requestId || crypto.randomUUID(),
    correlationId: ctx.correlationId || crypto.randomUUID(),
    userId: ctx.userId,
    goalId: ctx.goalId,
    decisionId: ctx.decisionId,
    startTime: ctx.startTime || Date.now(),
  };
  return asyncLocalStorage.run(fullCtx, fn);
}

/**
 * Retrieves the current request context from AsyncLocalStorage.
 * Returns undefined if called outside a request scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}
