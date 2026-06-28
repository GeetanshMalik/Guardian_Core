import { getRequestContext, runWithRequestContext } from "./requestContext.js";
import { logger } from "./logger.js";
import crypto from "node:crypto";

/**
 * Traces the execution of an asynchronous block or promise as a structured span.
 * Supports nesting by automatically resolving the parent context.
 */
export async function tracePromise<T>(
  spanName: string,
  promise: Promise<T> | (() => Promise<T>)
): Promise<T> {
  const ctx = getRequestContext();
  const spanId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  
  // Resolve parent span ID from context
  const parentSpanId = ctx && (ctx as any).spanId ? (ctx as any).spanId : "root";

  logger.info(`[TraceSpan] Starting span: "${spanName}"`, {
    spanId,
    parentSpanId,
    spanAction: "start"
  });

  const runAndRecord = async () => {
    try {
      const exec = typeof promise === "function" ? promise : () => promise;
      const result = await exec();
      
      const durationMs = Date.now() - startTime;
      logger.info(`[TraceSpan] Completed span: "${spanName}"`, {
        spanId,
        parentSpanId,
        durationMs,
        spanAction: "complete",
        spanStatus: "success"
      });
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      logger.error(`[TraceSpan] Failed span: "${spanName}"`, {
        spanId,
        parentSpanId,
        durationMs,
        spanAction: "complete",
        spanStatus: "failure",
        error: err.message
      });
      throw err;
    }
  };

  if (ctx) {
    // Propagate tracing ids deeper down the AsyncLocalStorage stack
    return runWithRequestContext(
      {
        ...ctx,
        spanId,
        parentSpanId
      } as any,
      runAndRecord
    );
  }

  return runAndRecord();
}
