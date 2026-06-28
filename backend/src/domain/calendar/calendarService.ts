/**
 * Domain Service: Calendar (§17.7 — Scheduling Domain)
 * 
 * Wraps calendar sync operations and emits CalendarSynced events.
 */
import { getGoalById, saveGoal } from "../../db.js";
import { domainEventBus } from "../events.js";
import { ToolExecutionFramework } from "../../cognitive/toolExecution.js";
import type { Goal, ToolExecutionRequest } from "../../types.js";

export class CalendarService {
  async syncGoalSessions(
    goal: Goal,
    sessionIds: string[],
    accessToken?: string
  ): Promise<Goal> {
    if (!goal.plan?.schedule) {
      throw new Error("No calendar sessions found");
    }

    const framework = ToolExecutionFramework.getInstance();
    const executionRequest: ToolExecutionRequest = {
      toolId: "google_calendar",
      operation: "sync_sessions",
      parameters: {
        sessionIds,
        schedule: goal.plan.schedule,
        tasks: goal.plan.tasks || [],
        goalTitle: goal.title,
        goalId: goal.id,
      },
      decisionId: goal.id,
      userId: "current-user",
      correlationId: "sync-" + Math.random().toString(36).substr(2, 9),
      requiredPermission: "https://www.googleapis.com/auth/calendar.events",
    };

    const result = await framework.execute(executionRequest, accessToken);

    if (!result.success) {
      throw new Error(result.metadata.error || "Failed to synchronize events to Google Calendar");
    }

    const updatedGoal = await getGoalById(goal.id);
    const finalGoal = updatedGoal || goal;

    const syncedCount = sessionIds.length;
    domainEventBus.emit({
      type: "CalendarSynced",
      goalId: goal.id,
      sessionCount: syncedCount,
      timestamp: new Date().toISOString(),
    });

    return finalGoal;
  }
}

/** Singleton instance */
export const calendarService = new CalendarService();
