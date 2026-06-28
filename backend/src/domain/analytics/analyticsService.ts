/**
 * Domain Service: Analytics (§17.7 — Analytics Domain)
 * 
 * Placeholder for analytics aggregation.
 * Listens for domain events to accumulate metrics.
 */
import { getGoals } from "../../db.js";
import {
  domainEventBus,
  type GoalCreatedEvent,
  type GoalCompletedEvent,
  type CalendarSyncedEvent,
} from "../events.js";
import type { Goal } from "../../types.js";

export interface GoalAnalytics {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  failedGoals: number;
  averageTaskCount: number;
  totalTasksCompleted: number;
  totalTasksPending: number;
}

export interface ProductivityMetrics {
  goalsCreatedThisSession: number;
  goalsCompletedThisSession: number;
  calendarSyncsThisSession: number;
}

// In-memory counters for session-scoped metrics
const sessionMetrics: ProductivityMetrics = {
  goalsCreatedThisSession: 0,
  goalsCompletedThisSession: 0,
  calendarSyncsThisSession: 0,
};

export class AnalyticsService {
  async getGoalAnalytics(): Promise<GoalAnalytics> {
    const goals = await getGoals();

    const activeGoals = goals.filter((g: Goal) => g.status === "active");
    const completedGoals = goals.filter((g: Goal) => g.status === "completed");
    const failedGoals = goals.filter((g: Goal) => g.status === "failed");

    const allTasks = goals.flatMap((g: Goal) => g.plan?.tasks || []);
    const completedTasks = allTasks.filter((t) => t.isCompleted);

    return {
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      failedGoals: failedGoals.length,
      averageTaskCount: goals.length > 0 ? Math.round(allTasks.length / goals.length) : 0,
      totalTasksCompleted: completedTasks.length,
      totalTasksPending: allTasks.length - completedTasks.length,
    };
  }

  getProductivityMetrics(): ProductivityMetrics {
    return { ...sessionMetrics };
  }

  /**
   * Register domain event listeners for accumulating analytics.
   * Called once at startup (eager registration).
   */
  registerEventListeners(): void {
    domainEventBus.on("GoalCreated", "AnalyticsService", (event: GoalCreatedEvent) => {
      if (event.metadata?.isReplay) return;
      sessionMetrics.goalsCreatedThisSession++;
    });

    domainEventBus.on("GoalCompleted", "AnalyticsService", (event: GoalCompletedEvent) => {
      if (event.metadata?.isReplay) return;
      sessionMetrics.goalsCompletedThisSession++;
    });

    domainEventBus.on("CalendarSynced", "AnalyticsService", (event: CalendarSyncedEvent) => {
      if (event.metadata?.isReplay) return;
      sessionMetrics.calendarSyncsThisSession++;
    });

    console.log("[AnalyticsService] Domain event listeners registered.");
  }
}

/** Singleton instance */
export const analyticsService = new AnalyticsService();
