import type { IWorker } from "../core/interfaces.js";

export interface WorkerMetadata {
  name: string;
  status: "idle" | "running" | "failed";
  lastRun?: string;
  lastSuccess?: string;
  averageDurationMs: number;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  lastHeartbeat: string;
}

export type WorkerCategory = "Event" | "Scheduled" | "Monitoring";

export interface ExtendedWorker extends IWorker {
  category: WorkerCategory;
  description: string;
  isEnabled: () => boolean;
}
