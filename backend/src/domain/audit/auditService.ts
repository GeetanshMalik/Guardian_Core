/**
 * Domain Service: Audit Service (§19.18)
 * 
 * Central domain service to handle logging of sensitive events.
 * Listens to domain events and supports manual/explicit audit logs from route controllers.
 */
import crypto from "node:crypto";
import { getRequestContext } from "../../infrastructure/requestContext.js";
import { domainEventBus } from "../events.js";
import { container } from "../../infrastructure/container.js";
import type { IAuditService } from "../../core/interfaces.js";
import type { AuditLog } from "../../types.js";

export class AuditService implements IAuditService {
  async log(
    action: string,
    resource: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userId?: string
  ): Promise<void> {
    const ctx = getRequestContext();
    const resolvedUserId = userId || ctx?.userId || "anonymous";
    const correlationId = ctx?.correlationId || crypto.randomUUID();

    const auditLog: AuditLog = {
      id: `audit-${crypto.randomUUID()}`,
      userId: resolvedUserId,
      action,
      resource,
      timestamp: new Date().toISOString(),
      ipAddress: ipAddress || "0.0.0.0",
      correlationId,
      details
    };

    // Save using repository
    await container.auditLogRepository.save(auditLog);
    console.log(`[AuditService] Sensitive Action Logged: ${action} on ${resource} (Correlation ID: ${correlationId})`);
  }

  async getAll(): Promise<AuditLog[]> {
    return container.auditLogRepository.findAll();
  }

  registerEventListeners(): void {
    // 1. Goal Created
    domainEventBus.on("GoalCreated", "AuditService", async (event) => {
      if (event.metadata?.isReplay) {
        console.log("[AuditService] Skipping GoalCreated audit log during replay.");
        return;
      }
      await this.log(
        "GOAL_CREATION",
        `goals/${event.goal.id}`,
        { title: event.goal.title },
        undefined,
        undefined
      );
    });

    // 2. Goal Deleted
    domainEventBus.on("GoalDeleted", "AuditService", async (event) => {
      if (event.metadata?.isReplay) {
        console.log("[AuditService] Skipping GoalDeleted audit log during replay.");
        return;
      }
      await this.log(
        "GOAL_DELETION",
        `goals/${event.goalId}`,
        undefined,
        undefined,
        undefined
      );
    });

    // 3. Decision Made
    domainEventBus.on("DecisionMade", "AuditService", async (event) => {
      if (event.metadata?.isReplay) {
        console.log("[AuditService] Skipping DecisionMade audit log during replay.");
        return;
      }
      await this.log(
        "DECISION_MADE",
        `decisions/${event.decisionId}`,
        { outcome: event.outcome, goalId: event.goalId },
        undefined,
        undefined
      );
    });
  }
}

export const auditService = new AuditService();
