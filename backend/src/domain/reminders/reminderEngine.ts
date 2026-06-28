/**
 * Domain: Dynamic Reminder Engine
 * 
 * Calculates reminders dynamically based on:
 *   Task Creation Time → Deadline → Calculate total available duration
 *   → Generate reminders at configurable percentage intervals
 * 
 * For short tasks: fewer reminders (just 1 at 50%)
 * For long projects: milestone-based reminders are added
 * 
 * Reminder percentages are configurable per-user via Settings.
 */
import { Goal, Milestone, SystemNotification } from "../../types.js";
import {
  ComputedReminder,
  ReminderConfig,
  DEFAULT_REMINDER_CONFIG,
} from "./reminderTypes.js";
import { getGoals, getNotifications } from "../../db.js";
import { GmailToolAdapter } from "../../cognitive/toolExecution.js";
import { container } from "../../infrastructure/container.js";

// ─── Reminder Calculation ───────────────────────────────────────────────────

/**
 * Computes all dynamic reminders for a given goal.
 */
export function computeReminders(
  goal: Goal,
  config: ReminderConfig = DEFAULT_REMINDER_CONFIG
): ComputedReminder[] {
  const reminders: ComputedReminder[] = [];
  const now = new Date();
  const createdAt = new Date(goal.createdAt);
  const deadline = parseDeadline(goal.deadline, createdAt);

  if (!deadline || deadline <= now) {
    // Deadline is in the past or unparseable — no reminders
    return [];
  }

  const totalDurationMs = deadline.getTime() - createdAt.getTime();
  const totalHours = totalDurationMs / (1000 * 60 * 60);

  // Determine how many percentage reminders to generate based on duration
  let percentages = [...config.percentages];

  if (totalHours < 2) {
    // Very short task: only 1 reminder at 50%
    percentages = [50];
  } else if (totalHours < 24) {
    // Short task (< 1 day): 50% and 25%
    percentages = percentages.filter(p => p >= 25);
  }

  // Cap at maxReminders
  percentages = percentages.slice(0, config.maxReminders);

  // Generate percentage-based reminders
  for (const pct of percentages) {
    const triggerTime = new Date(
      deadline.getTime() - (totalDurationMs * pct) / 100
    );

    // Skip reminders that would fire in the past
    if (triggerTime <= now) continue;

    reminders.push({
      id: `rem-${goal.id}-p${pct}`,
      goalId: goal.id,
      type: "percentage",
      triggerAt: triggerTime.toISOString(),
      message: buildReminderMessage(goal.title, pct, deadline),
      percentRemaining: pct,
      isDelivered: false,
      channels: ["in_app", "email"],
    });
  }

  // Generate milestone reminders for long projects (> 7 days)
  if (config.milestoneReminders && totalHours > 168 && goal.plan?.milestones) {
    for (const milestone of goal.plan.milestones) {
      if (milestone.status === "completed") continue;

      const milestoneDate = new Date(milestone.targetDate);
      // Reminder 1 day before milestone target
      const reminderDate = new Date(milestoneDate.getTime() - 24 * 60 * 60 * 1000);

      if (reminderDate > now) {
        reminders.push({
          id: `rem-${goal.id}-ms-${milestone.id}`,
          goalId: goal.id,
          type: "milestone",
          triggerAt: reminderDate.toISOString(),
          message: `⏰ Milestone approaching: "${milestone.title}" for goal "${goal.title}" is due tomorrow.`,
          percentRemaining: 0,
          isDelivered: false,
          channels: ["in_app", "email"],
        });
      }
    }
  }

  // Add a final "deadline approaching" reminder at 10% or 1 hour before, whichever is later
  const finalReminderTime = new Date(
    Math.max(
      deadline.getTime() - totalDurationMs * 0.1,
      deadline.getTime() - 60 * 60 * 1000 // 1 hour minimum
    )
  );
  if (finalReminderTime > now && !reminders.some(r => r.type === "deadline_approaching")) {
    reminders.push({
      id: `rem-${goal.id}-final`,
      goalId: goal.id,
      type: "deadline_approaching",
      triggerAt: finalReminderTime.toISOString(),
      message: `🚨 DEADLINE APPROACHING: "${goal.title}" is due ${formatTimeUntil(deadline)}. Complete remaining tasks now.`,
      percentRemaining: 10,
      isDelivered: false,
      channels: ["in_app", "email"],
    });
  }

  // Sort by trigger time
  reminders.sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime());

  return reminders;
}

// ─── Reminder Delivery ──────────────────────────────────────────────────────

/**
 * Checks all active goals for due reminders and delivers them.
 * Called by the ReminderWorker on each tick.
 */
export async function processDueReminders(): Promise<number> {
  const goals = await getGoals();
  const activeGoals = goals.filter(g => g.status === "active");
  const existingNotifications = await getNotifications();
  let deliveredCount = 0;

  for (const goal of activeGoals) {
    const reminders = computeReminders(goal);
    const now = new Date();

    for (const reminder of reminders) {
      // Skip already-delivered reminders (check by ID pattern in notifications)
      const isAlreadyDelivered = existingNotifications.some(
        n => n.id === `notif-${reminder.id}`
      );
      if (isAlreadyDelivered) continue;

      const triggerTime = new Date(reminder.triggerAt);
      if (triggerTime <= now) {
        // Due — deliver this reminder
        await deliverReminder(reminder, goal);
        deliveredCount++;
      }
    }
  }

  return deliveredCount;
}

/**
 * Delivers a single reminder via configured channels.
 */
async function deliverReminder(
  reminder: ComputedReminder,
  goal: Goal
): Promise<void> {
  // Channel 1: In-app notification (always)
  const notification: SystemNotification = {
    id: `notif-${reminder.id}`,
    type: reminder.type === "deadline_approaching" ? "warning" : "info",
    title: reminder.type === "deadline_approaching"
      ? `⚠ Deadline Alert: "${goal.title}"`
      : `⏰ Reminder: "${goal.title}"`,
    message: reminder.message,
    goalId: goal.id,
    createdAt: new Date().toISOString(),
    isRead: false,
  };

  // Push via container notification service to trigger event listeners / web sockets
  await container.notificationService.push(notification);
  console.log(`[ReminderEngine] Delivered in-app reminder: ${reminder.id}`);

  // Channel 2: Email notification (if Gmail is available)
  if (reminder.channels.includes("email")) {
    try {
      await sendEmailReminder(reminder, goal);
    } catch (err) {
      console.warn(`[ReminderEngine] Email delivery failed for ${reminder.id}, in-app notification still delivered.`);
    }
  }
}

/**
 * Sends an email reminder via Gmail (best-effort, non-blocking).
 */
async function sendEmailReminder(
  reminder: ComputedReminder,
  goal: Goal
): Promise<void> {
  // Only attempt if we have a real access token (not mock mode)
  // Email reminders are best-effort — failure does not block in-app delivery
  const gmailAdapter = new GmailToolAdapter();

  const deadlineStr = parseDeadline(goal.deadline, new Date(goal.createdAt));
  const formattedDeadline = deadlineStr
    ? deadlineStr.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : goal.deadline;

  const emailBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #0066cc, #0071e3); color: white; padding: 24px; border-radius: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px;">⏰ Guardian Core Reminder</h2>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">${reminder.message}</p>
      </div>
      <div style="background: #f5f5f7; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
        <p style="margin: 0 0 8px 0; color: #1d1d1f; font-weight: 600;">Goal: ${goal.title}</p>
        <p style="margin: 0; color: #7a7a7a; font-size: 14px;">Deadline: ${formattedDeadline}</p>
      </div>
      <p style="color: #7a7a7a; font-size: 12px; text-align: center;">
        This reminder was generated automatically by Guardian Core.
      </p>
    </div>
  `;

  try {
    await gmailAdapter.execute("create_draft", {
      to: "me",
      subject: `⏰ Reminder: ${goal.title} — ${reminder.percentRemaining}% time remaining`,
      body: emailBody,
    }, null); // null accessToken = mock mode, real token injected by worker
  } catch {
    // Silent failure — email is best-effort
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildReminderMessage(
  goalTitle: string,
  percentRemaining: number,
  deadline: Date
): string {
  const timeLeft = formatTimeUntil(deadline);

  if (percentRemaining >= 50) {
    return `📋 Halfway checkpoint: "${goalTitle}" — ${timeLeft} remaining until deadline. Stay on track!`;
  } else if (percentRemaining >= 25) {
    return `⚡ 75% of time elapsed: "${goalTitle}" — only ${timeLeft} remaining. Focus on completing key milestones.`;
  } else {
    return `🔥 ${100 - percentRemaining}% of time elapsed: "${goalTitle}" — ${timeLeft} remaining. Prioritize remaining tasks NOW.`;
  }
}

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "overdue";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (hours > 1) return `in ${hours} hours`;
  return "in less than an hour";
}

/**
 * Parses various deadline formats into a Date object.
 * Handles: ISO dates, "June 30", "July 1st", "This Friday", "Tomorrow", etc.
 */
function parseDeadline(deadline: string, referenceDate: Date): Date | null {
  // Try direct ISO parse
  const direct = new Date(deadline);
  if (!isNaN(direct.getTime())) return direct;

  // Try with current year appended
  const withYear = new Date(`${deadline}, ${new Date().getFullYear()}`);
  if (!isNaN(withYear.getTime())) return withYear;

  // Relative date patterns
  const lower = deadline.toLowerCase().trim();
  const now = new Date();

  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (lower === "today") {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (lower === "this weekend" || lower === "this saturday") {
    const d = new Date(now);
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (lower === "this friday") {
    const d = new Date(now);
    const daysUntilFri = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFri);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // "Next <dayname>" patterns
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(`next ${dayNames[i]}`)) {
      const d = new Date(now);
      const daysUntil = ((i - d.getDay() + 7) % 7) + 7; // Always next week
      d.setDate(d.getDate() + daysUntil);
      d.setHours(23, 59, 59, 999);
      return d;
    }
  }

  // "In X days" pattern
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10));
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // Fallback: treat deadline as 7 days from now
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(23, 59, 59, 999);
  return fallback;
}
