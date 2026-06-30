import { IWorker } from "../core/interfaces.js";
import { WorkerMetadata, ExtendedWorker } from "./base.js";
import { saveJob } from "../db.js";
import { runWithRequestContext } from "../infrastructure/requestContext.js";
import crypto from "node:crypto";

export class WorkerExecutionEngine {
  private workers: Map<string, ExtendedWorker> = new Map();
  private statuses: Map<string, WorkerMetadata> = new Map();
  private runningWorkers: Map<string, Promise<void>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastRunTimes: Map<string, number> = new Map();
  private workerIndex = 0;

  /**
   * Registers a worker in the engine.
   */
  registerWorker(worker: ExtendedWorker) {
    this.workers.set(worker.name, worker);
    // Stagger initial execution in production: each subsequent worker gets delayed
    const isTest = process.env.NODE_ENV === "test" || process.env.MOCK_GEMINI === "true";
    if (!isTest && this.workerIndex > 0) {
      const staggerOffsetMs = this.workerIndex * 10000; // 10s delay per worker index
      this.lastRunTimes.set(worker.name, Date.now() - worker.intervalMs + staggerOffsetMs);
    }
    this.workerIndex++;
    this.statuses.set(worker.name, {
      name: worker.name,
      status: "idle",
      averageDurationMs: 0,
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      lastHeartbeat: new Date().toISOString()
    });
    console.log(`[WorkerEngine] Registered ${worker.category} Worker: "${worker.name}" (Interval: ${worker.intervalMs}ms)`);
  }

  /**
   * Retrieves status for a specific worker.
   */
  getWorkerStatus(name: string): WorkerMetadata | undefined {
    return this.statuses.get(name);
  }

  /**
   * Retrieves status for all registered workers.
   */
  getAllWorkerStatuses(): WorkerMetadata[] {
    return Array.from(this.statuses.values());
  }

  /**
   * Starts the background scheduler loop.
   */
  start() {
    if (this.heartbeatInterval) return;

    console.log("[WorkerEngine] Starting Worker Execution Engine scheduler loop...");
    
    // Heartbeat tick runs every 15 seconds to check schedules
    this.heartbeatInterval = setInterval(() => this.tick(), 15000);
    
    // Delay initial tick to prevent startup burst, but optimize for scale-to-zero in production
    const isTest = process.env.NODE_ENV === "test" || process.env.MOCK_GEMINI === "true";
    const initialDelay = isTest ? 10 : (process.env.WORKER_INITIAL_DELAY ? parseInt(process.env.WORKER_INITIAL_DELAY, 10) : 5000);
    setTimeout(() => this.tick(), initialDelay);
  }

  /**
   * Stops the background scheduler loop.
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log("[WorkerEngine] Stopped Worker Execution Engine.");
    }
  }

  /**
   * Heartbeat tick to scan schedules and trigger due workers.
   */
  private tick() {
    const now = Date.now();
    for (const [name, worker] of this.workers.entries()) {
      // Update last heartbeat timestamp
      const status = this.statuses.get(name);
      if (status) {
        status.lastHeartbeat = new Date().toISOString();
      }

      // Check if feature flag / condition allows execution
      if (!worker.isEnabled()) {
        continue;
      }

      // If the worker has a positive intervalMs (not event-only/on-demand)
      if (worker.intervalMs > 0) {
        const lastRun = this.lastRunTimes.get(name) || 0;
        if (now - lastRun >= worker.intervalMs) {
          this.executeWorker(name).catch(err => {
            console.error(`[WorkerEngine] Scheduled run failed for worker "${name}":`, err);
          });
        }
      }
    }
  }

  /**
   * Executes a worker run with full lifecycle management (retries, timeouts, logging).
   */
  async executeWorker(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) {
      console.warn(`[WorkerEngine] Worker "${name}" not found in registry.`);
      return;
    }

    // Feature flag check
    if (!worker.isEnabled()) {
      console.log(`[WorkerEngine] Worker "${name}" is currently disabled via feature flags. Skipping execution.`);
      return;
    }

    // Concurrency Lock: Check if already running
    if (this.runningWorkers.has(name)) {
      console.log(`[WorkerEngine] Worker "${name}" is already executing. Concurrency block active.`);
      return;
    }

    const status = this.statuses.get(name)!;
    status.status = "running";
    this.lastRunTimes.set(name, Date.now());

    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    // Create a background job audit record (in processing state)
    const jobLogId = "job-" + crypto.randomUUID().slice(0, 8);
    await saveJob({
      id: jobLogId,
      workerName: name,
      type: worker.category.toUpperCase() + "_JOB",
      status: "processing",
      message: `Initiating execution loop for ${name}.`,
      createdAt: new Date().toISOString()
    }).catch(err => console.error(`[WorkerEngine] Failed to save initial job log:`, err));

    const runPromise = runWithRequestContext(
      {
        correlationId,
        userId: "system-worker",
        startTime
      },
      async () => {
        let attempts = 0;
        const maxAttempts = 3;
        const initialDelay = 500; // ms
        let lastError: any = null;

        while (attempts < maxAttempts) {
          attempts++;
          try {
            // Timeout limit of 30 seconds
            const timeoutMs = 30000;
            await Promise.race([
              worker.execute(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs)
              )
            ]);

            // Successful completion lifecycle
            const duration = Date.now() - startTime;
            status.status = "idle";
            status.lastSuccess = new Date().toISOString();
            status.lastRun = new Date().toISOString();
            status.totalRuns++;
            status.successCount++;
            
            // Running average
            status.averageDurationMs = Math.round(
              (status.averageDurationMs * (status.totalRuns - 1) + duration) / status.totalRuns
            );

            // Update the job audit record to completed
            await saveJob({
              id: jobLogId,
              workerName: name,
              type: worker.category.toUpperCase() + "_JOB",
              status: "completed",
              message: `Completed successfully. Duration: ${duration}ms. Attempts: ${attempts}.`,
              createdAt: new Date().toISOString()
            }).catch(err => console.error(`[WorkerEngine] Failed to save completion job log:`, err));

            // Record Worker Success Metrics
            try {
              const { metricsRegistry } = await import("../infrastructure/metrics.js");
              metricsRegistry.recordWorkerRun(name, "completed", duration, attempts);
            } catch (err) {
              console.error("[WorkerEngine] Failed to record worker metrics:", err);
            }

            return;
          } catch (err: any) {
            lastError = err;
            status.retryCount++;
            console.warn(`[WorkerEngine] Worker "${name}" failed attempt ${attempts}/${maxAttempts}. Error: ${err.message}`);

            if (attempts < maxAttempts) {
              const delay = initialDelay * Math.pow(2, attempts - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        // Permanent failure lifecycle
        const duration = Date.now() - startTime;
        status.status = "failed";
        status.lastRun = new Date().toISOString();
        status.totalRuns++;
        status.failureCount++;
        status.averageDurationMs = Math.round(
          (status.averageDurationMs * (status.totalRuns - 1) + duration) / status.totalRuns
        );

        console.error(`[WorkerEngine] Worker "${name}" failed all ${maxAttempts} attempts. Routing audit report.`);

        // Log final failure audit record
        await saveJob({
          id: jobLogId,
          workerName: name,
          type: worker.category.toUpperCase() + "_JOB",
          status: "failed",
          message: `Execution failed after ${maxAttempts} attempts. Error: ${lastError?.message || "Unknown error"}`,
          createdAt: new Date().toISOString()
        }).catch(err => console.error(`[WorkerEngine] Failed to save failure job log:`, err));

        // Record Worker Failure Metrics
        try {
          const { metricsRegistry } = await import("../infrastructure/metrics.js");
          metricsRegistry.recordWorkerRun(name, "failed", duration, maxAttempts);
        } catch (err) {
          console.error("[WorkerEngine] Failed to record worker metrics:", err);
        }
      }
    );

    this.runningWorkers.set(name, runPromise);
    try {
      await runPromise;
    } finally {
      this.runningWorkers.delete(name);
    }
  }
}

export const workerExecutionEngine = new WorkerExecutionEngine();
