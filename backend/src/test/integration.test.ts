import { describe, it, beforeEach, expect, resetDatabase } from "./framework.js";
import { container } from "../infrastructure/container.js";
import { domainEventBus } from "../domain/events.js";
import { workerExecutionEngine } from "../worker/engine.js";
import { getDeadLetterEvents, getProcessedEvents, getGoals } from "../db.js";
import crypto from "node:crypto";

describe("Integration Tests: GuardianCore Coordination", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should create a Goal and trigger planning via Coordinator", async () => {
    const title = "Pass QA Chapter 25 Test Suite";
    const deadline = "2026-07-01";
    const context = "Ensuring the test coverage is premium and thorough.";

    // 1. Goal Creation
    const goal = await container.guardianCore.createGoal(title, deadline, context);
    expect(goal).toExist();
    expect(goal.title).toBe(title);
    expect(goal.deadline).toBe(deadline);
    expect(goal.context).toBe(context);
    expect(goal.id).toExist();

    // 2. Planning Generation
    const updatedGoal = await container.guardianCore.generatePlan(goal.id, {
      "How many hours per day can you realistically dedicate to this goal?": "2 hours"
    });
    expect(updatedGoal.plan).toExist();
    expect(updatedGoal.plan?.tasks?.length).toBeGreaterThan(0);

    // 3. Complete Task
    const taskId = updatedGoal.plan?.tasks?.[0].id;
    expect(taskId).toExist();

    const completedGoal = await container.guardianCore.completeTask(goal.id, taskId!, true);
    const completedTask = completedGoal.plan?.tasks?.find((t) => t.id === taskId);
    expect(completedTask?.isCompleted).toBe(true);
  });
});

describe("Integration Tests: Event Bus Flow", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should publish and dispatch events to subscribers successfully", async () => {
    let receivedEventPayload: any = null;
    
    // Register test subscriber
    domainEventBus.on("GoalCreated", "TestSubscriber", (event) => {
      receivedEventPayload = event;
    });

    const eventPayload = {
      eventId: crypto.randomUUID(),
      type: "GoalCreated" as const,
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      userId: "user-123",
      version: 1,
      goal: { id: "g1", title: "Test Goal", deadline: "2026-07-01", context: "Testing event bus", status: "active" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    };

    domainEventBus.emit(eventPayload);

    // Wait a brief tick for async event delivery
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedEventPayload).toExist();
    expect(receivedEventPayload.goal.id).toBe("g1");
  });

  it("should enforce event subscriber idempotency and prevent duplicate runs", async () => {
    let callCount = 0;
    
    domainEventBus.on("GoalCompleted", "IdempotentTestSubscriber", () => {
      callCount++;
    });

    const eventId = crypto.randomUUID();
    const eventPayload = {
      eventId,
      type: "GoalCompleted" as const,
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      userId: "user-123",
      version: 1,
      goal: { id: "g1", title: "Test Goal", deadline: "2026-07-01", context: "Testing event bus", status: "completed" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    };

    // Emit first time
    domainEventBus.emit(eventPayload);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callCount).toBe(1);

    // Emit second time (with same eventId)
    domainEventBus.emit(eventPayload);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Call count should STILL be 1 because of idempotency tracking
    expect(callCount).toBe(1);
  });

  it("should route event to DLQ if subscriber execution fails repeatedly", async () => {
    let attempts = 0;
    domainEventBus.on("ResearchCompleted", "FailingTestSubscriber", () => {
      attempts++;
      throw new Error("Simulated transient error");
    });

    const eventPayload = {
      eventId: crypto.randomUUID(),
      type: "ResearchCompleted" as const,
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      userId: "user-123",
      version: 1,
      goalId: "g1",
      researchPackage: {
        id: "rp1",
        goalId: "g1",
        topic: "math",
        subtopics: ["algebra"],
        sources: [],
        summaries: ["summary text"],
        concepts: [],
        readingRoadmap: [],
        actionItems: [],
        freshnessStatus: "fresh" as const,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };

    domainEventBus.emit(eventPayload);

    // Wait for retries (initial delay is 100ms, retry 3 times with exponential backoff)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(attempts).toBe(3); // Attempted 3 times

    const dlq = await getDeadLetterEvents();
    const dlqItem = dlq.find(d => d.subscriberName === "FailingTestSubscriber" && d.eventId === eventPayload.eventId);
    expect(dlqItem).toExist();
    expect(dlqItem?.error?.message).toBe("Simulated transient error");
  });
});

describe("Integration Tests: Background Worker Engine", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should register and execute a scheduled worker loop", async () => {
    let executeCount = 0;
    const testWorker = {
      name: "TestIntervalWorker",
      description: "Test interval worker",
      category: "Scheduled" as const,
      intervalMs: 100, // run fast for test
      isEnabled: () => true,
      execute: async () => {
        executeCount++;
      }
    };

    workerExecutionEngine.registerWorker(testWorker);
    
    // Start engine scheduler
    workerExecutionEngine.start();

    // Let it run for 1200ms (should tick initial, then run scheduled loops)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Stop engine scheduler
    workerExecutionEngine.stop();

    expect(executeCount).toBeGreaterThan(0);
    const status = workerExecutionEngine.getWorkerStatus("TestIntervalWorker");
    expect(status).toExist();
    expect(status?.totalRuns).toBeGreaterThan(0);
    expect(status?.successCount).toBeGreaterThan(0);
    expect(status?.failureCount).toBe(0);
  });

  it("should handle worker retry on failure", async () => {
    let attempts = 0;
    const failingWorker = {
      name: "FailingTestWorker",
      description: "Failing test worker",
      category: "Monitoring" as const,
      intervalMs: 0, // run on-demand
      isEnabled: () => true,
      execute: async () => {
        attempts++;
        throw new Error("Simulated worker crash");
      }
    };

    workerExecutionEngine.registerWorker(failingWorker);
    
    // Trigger on-demand
    await workerExecutionEngine.executeWorker("FailingTestWorker");

    // Max attempts is 3
    expect(attempts).toBe(3);

    const status = workerExecutionEngine.getWorkerStatus("FailingTestWorker");
    expect(status?.failureCount).toBe(1);
    expect(status?.retryCount).toBe(3); // Increment counts on every failed attempt
  });
});
