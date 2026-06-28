/**
 * Background Worker Entry Point — Delegating to Worker Execution Engine (§18.12, §21)
 */
import { workerRegistry } from "./worker/registry.js";

/**
 * Initializes and starts the background Sentinel and Execution worker loop.
 */
export function startAgentWorker() {
  workerRegistry.start();
}

/**
 * Shuts down the background worker.
 */
export function stopAgentWorker() {
  workerRegistry.stop();
}
