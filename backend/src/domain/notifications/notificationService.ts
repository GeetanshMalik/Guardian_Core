/**
 * Domain Service: Notifications (§17.7 — Notification Domain)
 * 
 * Manages notification CRUD and auto-generates notifications
 * from domain events (GoalCreated, ResearchCompleted, etc.)
 */
import {
  getNotifications,
  saveNotification,
  markNotificationAsRead as dbMarkRead,
  clearAllNotifications as dbClearAll,
} from "../../db.js";
import {
  domainEventBus,
  type GoalCreatedEvent,
  type GoalCompletedEvent,
  type ResearchCompletedEvent,
} from "../events.js";
import type { SystemNotification } from "../../types.js";

export class NotificationService {
  async getAll(): Promise<SystemNotification[]> {
    return getNotifications();
  }

  async markRead(id: string): Promise<void> {
    await dbMarkRead(id);
  }

  async clearAll(): Promise<void> {
    await dbClearAll();
  }

  async push(notification: SystemNotification): Promise<void> {
    await saveNotification(notification);

    domainEventBus.emit({
      type: "NotificationRequested",
      notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Register domain event listeners for auto-generating notifications.
   * Called once at startup (eager registration).
   */
  registerEventListeners(): void {
    domainEventBus.on("GoalCreated", "NotificationService", (event: GoalCreatedEvent) => {
      if (event.metadata?.isReplay) {
        console.log("[NotificationService] Skipping GoalCreated notification auto-generation during replay.");
        return;
      }
      const notification: SystemNotification = {
        id: "notif-" + Math.random().toString(36).substr(2, 9),
        type: "success",
        title: `New Goal Created: "${event.goal.title}"`,
        message: `Your goal has been configured with ${event.goal.plan?.tasks?.length || 0} tasks.`,
        goalId: event.goal.id,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      saveNotification(notification).catch((err) =>
        console.error("[NotificationService] Failed to auto-notify GoalCreated:", err)
      );
    });

    domainEventBus.on("GoalCompleted", "NotificationService", (event: GoalCompletedEvent) => {
      if (event.metadata?.isReplay) {
        console.log("[NotificationService] Skipping GoalCompleted notification auto-generation during replay.");
        return;
      }
      const notification: SystemNotification = {
        id: "notif-" + Math.random().toString(36).substr(2, 9),
        type: "success",
        title: `Goal Completed: "${event.goal.title}"`,
        message: "Congratulations! All milestones have been achieved.",
        goalId: event.goal.id,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      saveNotification(notification).catch((err) =>
        console.error("[NotificationService] Failed to auto-notify GoalCompleted:", err)
      );
    });

    domainEventBus.on("ResearchCompleted", "NotificationService", (event: ResearchCompletedEvent) => {
      if (event.metadata?.isReplay) {
        console.log("[NotificationService] Skipping ResearchCompleted notification auto-generation during replay.");
        return;
      }
      const notification: SystemNotification = {
        id: "notif-" + Math.random().toString(36).substr(2, 9),
        type: "info",
        title: `Research Ready: "${event.researchPackage.topic}"`,
        message: `Research package synthesized with ${event.researchPackage.sources.length} sources and ${event.researchPackage.concepts.length} concepts.`,
        goalId: event.goalId,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      saveNotification(notification).catch((err) =>
        console.error("[NotificationService] Failed to auto-notify ResearchCompleted:", err)
      );
    });

    console.log("[NotificationService] Domain event listeners registered.");
  }
}

/** Singleton instance */
export const notificationService = new NotificationService();
