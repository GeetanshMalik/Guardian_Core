/**
 * Domain: Reminder Types
 * 
 * Type definitions for the dynamic reminder system.
 * Reminders are calculated relative to task creation time and deadline,
 * not at fixed intervals.
 */

export interface ReminderConfig {
  /** Percentages of remaining time at which to fire reminders. Default: [50, 25, 10] */
  percentages: number[];
  /** Minimum number of reminders for any task */
  minReminders: number;
  /** Maximum number of reminders for long projects */
  maxReminders: number;
  /** Whether to generate additional reminders at milestone target dates */
  milestoneReminders: boolean;
}

export interface ComputedReminder {
  id: string;
  goalId: string;
  type: "percentage" | "milestone" | "deadline_approaching";
  /** ISO datetime when this reminder should fire */
  triggerAt: string;
  /** Human-readable reminder message */
  message: string;
  /** Percentage of time remaining when this reminder fires */
  percentRemaining: number;
  /** Whether this reminder has been delivered */
  isDelivered: boolean;
  /** When the reminder was delivered, if applicable */
  deliveredAt?: string;
  /** Delivery channels used */
  channels: ("in_app" | "email")[];
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  percentages: [50, 25, 10],
  minReminders: 1,
  maxReminders: 5,
  milestoneReminders: true,
};
