import { workerExecutionEngine } from "./engine.js";
import { domainEventBus } from "../domain/events.js";
import {
  dailyBriefWorker,
  deadlineMonitoringWorker,
  calendarSynchronizationWorker,
  learningWorker,
  reflectionWorker,
  memoryConsolidationWorker,
  researchRefreshWorker,
  notificationWorker,
  riskAssessmentWorker,
  analyticsWorker,
  reminderWorker,
  schedulingOptimizerWorker
} from "./implementations.js";

export class WorkerRegistry {
  private isStarted = false;

  /**
   * Registers all core background workers and binds event-driven triggers.
   */
  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    console.log("[WorkerRegistry] Initializing Autonomous Background Worker registry...");

    // 1. Register all 10 workers in the Execution Engine
    workerExecutionEngine.registerWorker(dailyBriefWorker);
    workerExecutionEngine.registerWorker(deadlineMonitoringWorker);
    workerExecutionEngine.registerWorker(calendarSynchronizationWorker);
    workerExecutionEngine.registerWorker(learningWorker);
    workerExecutionEngine.registerWorker(reflectionWorker);
    workerExecutionEngine.registerWorker(memoryConsolidationWorker);
    workerExecutionEngine.registerWorker(researchRefreshWorker);
    workerExecutionEngine.registerWorker(notificationWorker);
    workerExecutionEngine.registerWorker(riskAssessmentWorker);
    workerExecutionEngine.registerWorker(analyticsWorker);
    workerExecutionEngine.registerWorker(reminderWorker);
    workerExecutionEngine.registerWorker(schedulingOptimizerWorker);

    // 2. Bind Event-Driven workers to their respective event subscriptions on the Event Bus
    
    // Learning Worker runs immediately on ObservationCreated events
    domainEventBus.on("ObservationCreated", "LearningWorkerTrigger", async () => {
      console.log("[WorkerRegistry] Event 'ObservationCreated' captured. Triggering Learning Worker.");
      workerExecutionEngine.executeWorker("Learning Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Learning Worker from event:", err);
      });
    });

    // Reflection Worker runs immediately on GoalCompleted events
    domainEventBus.on("GoalCompleted", "ReflectionWorkerTrigger", async () => {
      console.log("[WorkerRegistry] Event 'GoalCompleted' captured. Triggering Reflection Worker.");
      workerExecutionEngine.executeWorker("Reflection Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Reflection Worker from event:", err);
      });
    });

    // Risk Assessment Worker runs immediately on GoalUpdated events
    domainEventBus.on("GoalUpdated", "RiskAssessmentWorkerTrigger", async () => {
      console.log("[WorkerRegistry] Event 'GoalUpdated' captured. Triggering Risk Assessment Worker.");
      workerExecutionEngine.executeWorker("Risk Assessment Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Risk Assessment Worker from event:", err);
      });
    });

    // Notification Worker runs immediately on NotificationRequested events
    domainEventBus.on("NotificationRequested", "NotificationWorkerTrigger", async () => {
      // Avoid circular infinite loops by ignoring notifications triggered by Notification Worker itself!
      // But the event-driven trigger is useful to clean up / audit.
      workerExecutionEngine.executeWorker("Notification Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Notification Worker from event:", err);
      });
    });

    // Learning Worker runs on TaskPostponed events to learn behavioral patterns
    domainEventBus.on("TaskPostponed", "LearningWorkerPostponeTrigger", async () => {
      console.log("[WorkerRegistry] Event 'TaskPostponed' captured. Triggering Learning Worker for behavioral analysis.");
      workerExecutionEngine.executeWorker("Learning Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Learning Worker from TaskPostponed event:", err);
      });
    });

    // Learning Worker runs on ReminderIgnored events to refine notification preferences
    domainEventBus.on("ReminderIgnored", "LearningWorkerReminderTrigger", async () => {
      console.log("[WorkerRegistry] Event 'ReminderIgnored' captured. Triggering Learning Worker for reminder preference analysis.");
      workerExecutionEngine.executeWorker("Learning Worker").catch(err => {
        console.error("[WorkerRegistry] Failed executing Learning Worker from ReminderIgnored event:", err);
      });
    });

    // 3. Start the Worker Execution Engine's scheduled ticks
    workerExecutionEngine.start();
    console.log("[WorkerRegistry] Background workers successfully registered and scheduling started.");
  }

  /**
   * Shuts down all workers and cancels scheduled ticks.
   */
  stop() {
    if (!this.isStarted) return;
    this.isStarted = false;

    workerExecutionEngine.stop();
    console.log("[WorkerRegistry] Stopped background workers execution.");
  }
}

export const workerRegistry = new WorkerRegistry();
