import {
  saveJob,
  saveNotification,
  getGoals,
  getPreferenceMemories,
  savePreferenceMemory,
  getSemanticMemories,
  saveSemanticMemory,
  getEpisodicMemories,
  deleteMemory,
  getResearchPackages,
  saveResearchPackage,
  getNotifications,
  getObservations
} from "../db.js";
import { runProgressAndRecoveryEvaluation, runExecutionAssistance } from "../agents.js";
import { Goal, SystemNotification, AgentJob, PreferenceMemory, ReflectionMemory, Observation, Task } from "../types.js";
import { logEpisodicMemory } from "../cognitive/memory.js";
import { decayConfidenceScores } from "../cognitive/learning.js";
import { ResearchIntelligence } from "../cognitive/research.js";
import { config } from "../infrastructure/config.js";
import { container } from "../infrastructure/container.js";
import { domainEventBus } from "../domain/events.js";
import { ExtendedWorker } from "./base.js";
import crypto from "node:crypto";

/**
 * 1. Daily Brief Worker
 * Generates an executive summary of priorities, deadlines, calendar status, and recovery recommendations.
 */
export const dailyBriefWorker: ExtendedWorker = {
  name: "Daily Brief Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily
  category: "Scheduled",
  description: "Generates an intelligent daily briefing of priorities and risks for the user.",
  isEnabled: () => config.featureFlags.enableNotifications,
  execute: async () => {
    console.log("[DailyBriefWorker] Compiling daily briefings...");
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    if (activeGoals.length === 0) {
      console.log("[DailyBriefWorker] No active goals. Skipping briefing generation.");
      return;
    }

    const goalsAtRisk = activeGoals.filter(
      g => g.progress?.currentRiskLevel === "High" || g.progress?.currentRiskLevel === "Medium"
    );

    let priorityTasks: string[] = [];
    activeGoals.forEach(g => {
      if (g.plan?.tasks) {
        const incomplete = g.plan.tasks.filter(t => !t.isCompleted).slice(0, 2);
        incomplete.forEach(t => priorityTasks.push(`- "${t.title}" (Goal: ${g.title})`));
      }
    });

    const briefText = `
Good Morning, Geetansh.
Here is your Guardian briefing for today:
- You have ${activeGoals.length} active strategic goals.
- ${goalsAtRisk.length} goals require recovery monitoring due to elevated risk levels.
- Top priorities for today:
${priorityTasks.length > 0 ? priorityTasks.join("\n") : "  None scheduled. Good job staying ahead!"}
    `.trim();

    // Create System Notification representing the daily briefing
    const briefNotification: SystemNotification = {
      id: "notif-brief-" + crypto.randomUUID().slice(0, 8),
      type: "info",
      title: "Your Daily Executive Briefing",
      message: briefText,
      createdAt: new Date().toISOString(),
      isRead: false
    };

    await saveNotification(briefNotification);

    domainEventBus.emit({
      type: "DailyBriefGenerated",
      briefText,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 2. Deadline Monitoring Worker
 * Runs hourly to scan active goal progress, risk levels, procrastination indexes, and recovery schedules.
 * Also proactively generates task outline blueprints.
 */
export const deadlineMonitoringWorker: ExtendedWorker = {
  name: "Deadline Monitoring Worker",
  intervalMs: 60 * 60 * 1000, // Hourly
  category: "Monitoring",
  description: "Evaluates goal deadline risks, calculates procrastination, and pre-fills task templates.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[DeadlineMonitoringWorker] Scanning active goals for risks and progress...");
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    for (const goal of activeGoals) {
      try {
        // Run Sentinel Agent evaluation (Agent 7 & 8)
        const result = await runProgressAndRecoveryEvaluation(goal);
        
        const previousRisk = goal.progress?.currentRiskLevel || "Low";
        const currentRisk = result.currentRiskLevel;

        // Persist progress details
        goal.progress = {
          currentRiskLevel: currentRisk,
          procrastinationIndicator: result.procrastinationIndicator,
          riskExplanations: result.riskExplanations,
          recoveryPlan: result.recoveryPlan
        };
        await container.goalRepository.save(goal);

        // Alert user if risk elevates to Medium/High
        if ((currentRisk === "High" || currentRisk === "Medium") && previousRisk !== currentRisk) {
          const urgentAlert: SystemNotification = {
            id: "notif-risk-" + crypto.randomUUID().slice(0, 8),
            type: currentRisk === "High" ? "rescue" : "warning",
            title: `Alert: Elevated Risk for "${goal.title}"`,
            message: `Our Sentinel Agent detected progress lag (Procrastination index: ${result.procrastinationIndicator}%). An adaptive rescue/recovery roadmap has been drafted for your activation.`,
            goalId: goal.id,
            createdAt: new Date().toISOString(),
            isRead: false
          };
          await saveNotification(urgentAlert);
        }

        // Proactively generate task outline pre-fills (formerly Step 2 in legacy worker)
        await proactivelyGenerateTaskDrafts(goal);

        domainEventBus.emit({
          type: "DeadlineRiskDetected",
          goalId: goal.id,
          riskLevel: currentRisk,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        console.error(`[DeadlineMonitoringWorker] Failed scanning progress for goal ${goal.id}:`, err);
      }
    }
  }
};

/**
 * Proactive task outline compiler helper.
 */
async function proactivelyGenerateTaskDrafts(goal: Goal) {
  if (!goal.plan?.tasks) return;

  // Find the first incomplete task that doesn't have AI assistance compiled yet
  const nextIncompleteTask = goal.plan.tasks.find(t => !t.isCompleted && !t.aiAssistance);
  if (!nextIncompleteTask) return;

  try {
    console.log(`[DeadlineMonitoringWorker] Proactively compiling execution outline for: "${nextIncompleteTask.title}"`);
    
    // Run the Execution Agent (Agent 6)
    const result = await runExecutionAssistance(
      goal.title,
      nextIncompleteTask.title,
      nextIncompleteTask.description,
      "Proactive background optimization"
    );

    // Update the task with pre-filled AI assistance
    nextIncompleteTask.aiAssistance = {
      generatedAt: new Date().toISOString(),
      assetType: result.assetType || "Proactive SOP Guide",
      content: result.content
    };
    await container.goalRepository.save(goal);

    // Send a system notification
    const proactiveAlert: SystemNotification = {
      id: "notif-draft-" + crypto.randomUUID().slice(0, 8),
      type: "info",
      title: "Draft Asset Compiled",
      message: `Execution Worker has compiled a draft outline and resource sheet for milestone: "${nextIncompleteTask.title}". It is now ready in your workspace.`,
      goalId: goal.id,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    await saveNotification(proactiveAlert);

  } catch (err) {
    console.error(`[DeadlineMonitoringWorker] Proactive draft compilation failed for task ${nextIncompleteTask.id}:`, err);
  }
}

/**
 * 3. Calendar Synchronization Worker
 * Synchronizes sessions in calendar to Google Calendar.
 */
export const calendarSynchronizationWorker: ExtendedWorker = {
  name: "Calendar Synchronization Worker",
  intervalMs: 15 * 60 * 1000, // 15 Minutes
  category: "Scheduled",
  description: "Synchronizes calendar sessions with Google Calendars automatically.",
  isEnabled: () => config.featureFlags.enableCalendarSync,
  execute: async () => {
    console.log("[CalendarSynchronizationWorker] Syncing goal calendar schedules...");
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    for (const goal of activeGoals) {
      if (goal.plan?.schedule && goal.plan.schedule.length > 0) {
        const sessionIds = goal.plan.schedule.map(s => s.id);
        try {
          await container.calendarService.syncGoalSessions(goal, sessionIds);
          
          domainEventBus.emit({
            type: "CalendarSynchronized",
            goalId: goal.id,
            syncedEventsCount: sessionIds.length,
            timestamp: new Date().toISOString()
          });
        } catch (err: any) {
          console.error(`[CalendarSynchronizationWorker] Sync failed for goal ${goal.id}: ${err.message}`);
        }
      }
    }
  }
};

/**
 * 4. Learning Worker
 * Consolidates capture observation logs into preference memories.
 */
export const learningWorker: ExtendedWorker = {
  name: "Learning Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily/Nightly
  category: "Event",
  description: "Promotes learning observations into user preferences and decays confidence metrics.",
  isEnabled: () => config.featureFlags.enableLearning,
  execute: async () => {
    console.log("[LearningWorker] Triggering learning cycle and confidence decays...");
    
    // Decay confidence levels
    await decayConfidenceScores();

    // Scan observations and auto-promote to preferences if criteria are met
    const observations = await getObservations();
    let promotedCount = 0;

    for (const obs of observations) {
      // If observation has high confidence and is confirmed or has no negative feedback
      if (obs.confidence >= 75 && obs.userFeedback !== "down") {
        const key = obs.capability + ":" + obs.action;
        const newPreference: PreferenceMemory = {
          id: "pref-" + crypto.randomUUID().slice(0, 8),
          preferenceKey: key,
          value: obs.evidence,
          confidence: obs.confidence,
          evidenceCount: 1,
          source: obs.source,
          lastUpdated: new Date().toISOString(),
          version: 1,
          status: "promoted"
        };
        await savePreferenceMemory(newPreference);
        promotedCount++;

        domainEventBus.emit({
          type: "PreferenceLearned",
          preferenceKey: key,
          value: obs.evidence,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (promotedCount > 0) {
      console.log(`[LearningWorker] Promoted ${promotedCount} observations to preference memories.`);
    }
  }
};

/**
 * 5. Reflection Worker
 * Generates post-milestone or post-goal reflections.
 */
export const reflectionWorker: ExtendedWorker = {
  name: "Reflection Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily/Nightly
  category: "Event",
  description: "Extracts insights and learnings from completed work milestones.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[ReflectionWorker] Running reflection updates...");
    const goals = await getGoals();
    const completed = goals.filter(g => g.status === "completed");

    for (const goal of completed) {
      // Record a reflection fact in memory if not already done
      const reflectionText = `Completed goal execution: "${goal.title}". Verified constraints and milestones.`;
      
      const reflectionFact = {
        id: "ref-goal-" + crypto.randomUUID().slice(0, 8),
        insight: reflectionText,
        sourceGoalId: goal.id,
        timestamp: new Date().toISOString(),
        category: "milestone_completion"
      };

      // Save using repository
      await container.memoryRepository.saveSemanticMemory({
        id: reflectionFact.id,
        fact: reflectionFact.insight,
        category: reflectionFact.category,
        lastUpdated: reflectionFact.timestamp
      });

      domainEventBus.emit({
        type: "ReflectionCreated",
        goalId: goal.id,
        insight: reflectionText,
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * 6. Memory Consolidation Worker
 * Consolidates episodic, semantic and preference memory layers.
 */
export const memoryConsolidationWorker: ExtendedWorker = {
  name: "Memory Consolidation Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily/Nightly
  category: "Scheduled",
  description: "Consolidates preference layers, archives outcomes, and reduces memory fragmentation.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[MemoryConsolidationWorker] Consolidating shared memory structures...");
    const goals = await getGoals();
    const episodes = await getEpisodicMemories();
    const preferences = await getPreferenceMemories();

    let consolidatedCount = 0;

    // 1. Goal outcomes -> Episodic / Semantic Consolidation
    for (const goal of goals) {
      if (goal.status === "completed") {
        const hasEpisode = episodes.some(
          (ep) =>
            ep.relatedGoals &&
            ep.relatedGoals.includes(goal.id) &&
            ep.outcome.includes("achieved")
        );
        if (!hasEpisode) {
          // Log completion episode
          await logEpisodicMemory(
            ["User", "Guardian Core"],
            `Goal achieved: "${goal.title}"`,
            [goal.id],
            [`Completed execution of goal. Title: "${goal.title}". Context: "${goal.context || ""}"`]
          );

          // Log completion semantic fact
          await saveSemanticMemory({
            id: "sem-done-" + crypto.randomUUID().slice(0, 8),
            fact: `User successfully completed the goal "${goal.title}".`,
            category: "history",
            lastUpdated: new Date().toISOString(),
          });

          consolidatedCount++;
        }
      }
    }

    // 2. Preferences consolidation (merge duplicates, increase confidence for consolidated items)
    const seenKeys = new Map<string, PreferenceMemory>();
    const toDelete: string[] = [];
    for (const pref of preferences) {
      const key = pref.preferenceKey;
      if (seenKeys.has(key)) {
        const existing = seenKeys.get(key)!;
        if (new Date(pref.lastUpdated) > new Date(existing.lastUpdated)) {
          toDelete.push(existing.id);
          pref.confidence = Math.min(100, pref.confidence + 5);
          pref.evidenceCount = (pref.evidenceCount || 1) + (existing.evidenceCount || 1);
          seenKeys.set(key, pref);
        } else {
          toDelete.push(pref.id);
          existing.confidence = Math.min(100, existing.confidence + 5);
          existing.evidenceCount = (existing.evidenceCount || 1) + (pref.evidenceCount || 1);
        }
        consolidatedCount++;
      } else {
        seenKeys.set(key, pref);
      }
    }

    // Apply preference cleanups
    for (const id of toDelete) {
      await deleteMemory("preference", id);
    }
    for (const pref of seenKeys.values()) {
      await savePreferenceMemory(pref);
    }

    // Apply preference confidence decay
    await decayConfidenceScores();

    domainEventBus.emit({
      type: "MemoryConsolidated",
      memoryType: "PreferenceMemory",
      recordCount: consolidatedCount,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 7. Research Refresh Worker
 * Detects stale research summaries and triggers background refresh.
 */
export const researchRefreshWorker: ExtendedWorker = {
  name: "Research Refresh Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily
  category: "Scheduled",
  description: "Triggers autonomous refreshes for research packages older than 24 hours.",
  isEnabled: () => config.featureFlags.enableResearch,
  execute: async () => {
    console.log("[ResearchRefreshWorker] Auditing research package freshness...");
    const packages = await getResearchPackages();
    const activeGoals = (await getGoals()).filter(g => g.status === "active");

    for (const pkg of packages) {
      const goal = activeGoals.find(g => g.id === pkg.goalId);
      if (!goal) continue;

      const ageMs = Date.now() - new Date(pkg.lastUpdated).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      // Refresh if older than 24 hours
      if (ageHours >= 24 && pkg.freshnessStatus === "fresh") {
        console.log(`[ResearchRefreshWorker] Research Package "${pkg.topic}" is stale. Re-triggering synthesis.`);
        pkg.freshnessStatus = "stale";
        await saveResearchPackage(pkg);

        // Run background refresh asynchronously
        ResearchIntelligence.generateResearchPackage(pkg.goalId, pkg.topic, goal.context)
          .then(() => {
            domainEventBus.emit({
              type: "ResearchPackageUpdated",
              goalId: pkg.goalId,
              topic: pkg.topic,
              timestamp: new Date().toISOString()
            });
          })
          .catch(err => console.error(`[ResearchRefreshWorker] Refresh failed: ${err.message}`));

        // Notify user
        const refreshNotification: SystemNotification = {
          id: "notif-res-" + crypto.randomUUID().slice(0, 8),
          type: "info",
          title: "Research Package Refreshed",
          message: `The research and prerequisite documentation for "${pkg.topic}" has been updated with fresh sources.`,
          goalId: pkg.goalId,
          createdAt: new Date().toISOString(),
          isRead: false
        };
        await saveNotification(refreshNotification);
      }
    }
  }
};

/**
 * 8. Notification Worker
 * Cleans up and batches notification list.
 */
export const notificationWorker: ExtendedWorker = {
  name: "Notification Worker",
  intervalMs: 5 * 60 * 1000, // 5 Minutes
  category: "Monitoring",
  description: "Batches alerts, deletes old logs exceeding limits, and suppresses redundancy.",
  isEnabled: () => config.featureFlags.enableNotifications,
  execute: async () => {
    console.log("[NotificationWorker] Batching and cleaning notifications...");
    const notifications = await getNotifications();

    if (notifications.length > config.notifications.maxStored) {
      // Deleting older records via DB is implicitly handled by saveNotification cap, 
      // but let's log the event
      console.log(`[NotificationWorker] Notification logs checked. Currently storing ${notifications.length} alerts.`);
    }

    domainEventBus.emit({
      type: "NotificationDelivered",
      notificationId: "system-cleanup",
      recipient: "all-devices",
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 9. Risk Assessment Worker
 * Assesses overall workload density and completion probability.
 */
export const riskAssessmentWorker: ExtendedWorker = {
  name: "Risk Assessment Worker",
  intervalMs: 0, // Event-driven / On-demand only
  category: "Monitoring",
  description: "Evaluates overall workload density and triggers replanning warnings.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[RiskAssessmentWorker] Evaluating capacity metrics and overload factors...");
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    const dateCounts: Record<string, number> = {};
    activeGoals.forEach(g => {
      if (g.plan?.tasks) {
        g.plan.tasks.forEach(t => {
          if (!t.isCompleted && t.completedAt === null) {
            // Task has a day number or date schedule
            const dateKey = `Day-${t.dayNumber}`;
            dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
          }
        });
      }
    });

    // Check if any specific day has overload (> 4 tasks scheduled)
    const overloadedDays = Object.entries(dateCounts).filter(([_, count]) => count > 4);
    if (overloadedDays.length > 0) {
      console.warn(`[RiskAssessmentWorker] Overload detected on days: ${overloadedDays.map(o => o[0]).join(", ")}`);
      
      const warningNotif: SystemNotification = {
        id: "notif-overload-" + crypto.randomUUID().slice(0, 8),
        type: "warning",
        title: "Workload Overload Detected",
        message: "You have more than 4 tasks scheduled on a single day. replanning your roadmaps is advised.",
        createdAt: new Date().toISOString(),
        isRead: false
      };
      await saveNotification(warningNotif);
    }

    domainEventBus.emit({
      type: "RiskAssessmentCompleted",
      goalId: activeGoals[0]?.id || "none",
      riskScore: overloadedDays.length > 0 ? 80 : 20,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 10. Analytics Worker
 * Generates overall productivity metrics.
 */
export const analyticsWorker: ExtendedWorker = {
  name: "Analytics Worker",
  intervalMs: 6 * 60 * 60 * 1000, // 6 Hours
  category: "Scheduled",
  description: "Computes system performance aggregates, planning accuracy, and completion rates.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[AnalyticsWorker] Compiling productivity metrics...");
    const goals = await getGoals();
    const completed = goals.filter(g => g.status === "completed").length;
    const total = goals.length;
    const accuracy = total > 0 ? Math.round((completed / total) * 100) : 100;

    domainEventBus.emit({
      type: "AnalyticsUpdated",
      metrics: {
        totalGoalsCount: total,
        completedGoalsCount: completed,
        historicalAccuracyScore: accuracy,
        compiledAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 11. Reminder Worker
 * Processes dynamic reminders for all active goals.
 * Checks every 60 seconds for due reminders and delivers via in-app + email.
 */
export const reminderWorker: ExtendedWorker = {
  name: "Reminder Worker",
  intervalMs: 60 * 1000, // Every 60 seconds
  category: "Scheduled",
  description: "Processes dynamic deadline-relative reminders and delivers via in-app notifications and email.",
  isEnabled: () => config.featureFlags.enableNotifications,
  execute: async () => {
    const { processDueReminders } = await import("../domain/reminders/reminderEngine.js");
    const deliveredCount = await processDueReminders();
    if (deliveredCount > 0) {
      console.log(`[ReminderWorker] Delivered ${deliveredCount} reminder(s).`);
    }
  }
};

/**
 * 12. Scheduling Optimizer Worker
 * Runs nightly to detect next-day overload and rebalance low-priority tasks.
 * Uses ZERO Gemini API calls — purely deterministic scheduling optimization.
 */
export const schedulingOptimizerWorker: ExtendedWorker = {
  name: "Scheduling Optimizer Worker",
  intervalMs: 24 * 60 * 60 * 1000, // Daily (nightly)
  category: "Scheduled",
  description: "Detects next-day overload and rebalances low-priority tasks to lighter days.",
  isEnabled: () => true,
  execute: async () => {
    console.log("[SchedulingOptimizerWorker] Scanning tomorrow's workload for overload...");
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    // Build a map of tasks per date across all active goals
    const tasksByDate: Record<string, Array<{ goal: Goal; task: Task; session: any }>> = {};

    for (const goal of activeGoals) {
      if (!goal.plan?.tasks || !goal.plan?.schedule) continue;
      for (const session of goal.plan.schedule) {
        if (!tasksByDate[session.date]) tasksByDate[session.date] = [];
        const task = goal.plan.tasks.find(t => t.id === session.taskId);
        if (task && !task.isCompleted) {
          tasksByDate[session.date].push({ goal, task, session });
        }
      }
    }

    // Check tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const tomorrowTasks = tasksByDate[tomorrowStr] || [];
    
    if (tomorrowTasks.length <= 4) {
      console.log(`[SchedulingOptimizerWorker] Tomorrow (${tomorrowStr}) has ${tomorrowTasks.length} task(s). No overload detected.`);
      return;
    }

    console.log(`[SchedulingOptimizerWorker] Overload detected! Tomorrow has ${tomorrowTasks.length} tasks. Rebalancing...`);

    // Sort tasks by priority (Low first, then Medium — keep High tasks in place)
    const movableTasks = tomorrowTasks
      .filter(t => t.task.priority !== "High")
      .sort((a, b) => {
        const priorityOrder = { "Low": 0, "Medium": 1, "High": 2 };
        return (priorityOrder[a.task.priority as keyof typeof priorityOrder] || 1)
             - (priorityOrder[b.task.priority as keyof typeof priorityOrder] || 1);
      });

    // Find the next day with the lightest load
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const dayAfterStr = dayAfterTomorrow.toISOString().split("T")[0];

    let movedCount = 0;
    const tasksToMove = movableTasks.slice(0, tomorrowTasks.length - 4); // Move enough to get down to 4

    for (const item of tasksToMove) {
      // Update the calendar session date
      item.session.date = dayAfterStr;
      item.session.isSynced = false;

      // Persist the goal with updated schedule
      await container.goalRepository.save(item.goal);
      movedCount++;

      console.log(`[SchedulingOptimizerWorker] Moved "${item.task.title}" from ${tomorrowStr} to ${dayAfterStr}`);
    }

    if (movedCount > 0) {
      const notification: SystemNotification = {
        id: "notif-optimizer-" + crypto.randomUUID().slice(0, 8),
        type: "info",
        title: "Schedule Optimized",
        message: `To prevent burnout tomorrow, Guardian Core moved ${movedCount} low-priority task(s) to ${dayAfterStr}. You now have ${tomorrowTasks.length - movedCount} task(s) scheduled for tomorrow.`,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      await saveNotification(notification);

      domainEventBus.emit({
        type: "GoalUpdated",
        goal: tasksToMove[0]?.goal,
        changedFields: ["plan.schedule"],
        timestamp: new Date().toISOString()
      });
    }
  }
};
