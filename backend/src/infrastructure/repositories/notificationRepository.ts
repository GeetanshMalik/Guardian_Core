/**
 * Repository: Notifications (§18.9)
 */
import {
  getNotifications,
  saveNotification,
  markNotificationAsRead,
  clearAllNotifications,
} from "../../db.js";
import type { INotificationRepository } from "../../core/interfaces.js";
import type { SystemNotification } from "../../types.js";

export class NotificationRepository implements INotificationRepository {
  async findAll(): Promise<SystemNotification[]> {
    return getNotifications();
  }

  async save(notification: SystemNotification): Promise<void> {
    await saveNotification(notification);
  }

  async markRead(id: string): Promise<void> {
    await markNotificationAsRead(id);
  }

  async clearAll(): Promise<void> {
    await clearAllNotifications();
  }
}

export const notificationRepository = new NotificationRepository();
