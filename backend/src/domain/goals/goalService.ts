/**
 * Domain Service: Goal Management (§17.7 — Goal Domain)
 * 
 * Encapsulates goal CRUD operations and emits domain events.
 * Decouples route handlers from direct db.ts calls.
 */
import { goalRepository } from "../../infrastructure/repositories/goalRepository.js";
import { domainEventBus } from "../events.js";
import type { Goal } from "../../types.js";

export class GoalService {
  async getAll(): Promise<Goal[]> {
    return goalRepository.findAll();
  }

  async getById(id: string): Promise<Goal | undefined> {
    return goalRepository.findById(id);
  }

  async create(goal: Goal): Promise<Goal> {
    await goalRepository.save(goal);

    domainEventBus.emit({
      type: "GoalCreated",
      goal,
      timestamp: new Date().toISOString(),
    });

    return goal;
  }

  async update(goal: Goal, changedFields: string[] = []): Promise<Goal> {
    const previousStatus = (await goalRepository.findById(goal.id))?.status;
    await goalRepository.save(goal);

    domainEventBus.emit({
      type: "GoalUpdated",
      goal,
      changedFields,
      timestamp: new Date().toISOString(),
    });

    // Check if goal was just completed
    if (goal.status === "completed" && previousStatus !== "completed") {
      domainEventBus.emit({
        type: "GoalCompleted",
        goal,
        timestamp: new Date().toISOString(),
      });
    }

    return goal;
  }

  async delete(id: string): Promise<void> {
    await goalRepository.delete(id);

    domainEventBus.emit({
      type: "GoalDeleted",
      goalId: id,
      timestamp: new Date().toISOString(),
    });
  }
}

/** Singleton instance */
export const goalService = new GoalService();
