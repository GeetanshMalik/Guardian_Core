/**
 * API Routes: Goals
 * 
 * Thin controllers — all business logic enters through GuardianCore.
 * Controllers never call individual services directly (§18.6).
 */
import { Router } from "express";
import { container } from "../../infrastructure/container.js";
import { parseNaturalLanguageGoal } from "../../agents.js";
import { ValidationError } from "../../infrastructure/errors.js";
import { ToolExecutionFramework } from "../../cognitive/toolExecution.js";

const { guardianCore, goalService, researchService, goalRepository } = container;

const router = Router();

async function autoSyncCalendarIfConnected(goal: any, accessToken?: string) {
  if (!goal || !goal.plan?.schedule || goal.plan.schedule.length === 0 || !accessToken) {
    return;
  }
  const unsyncedSessionIds = goal.plan.schedule
    .filter((s: any) => !s.isSynced)
    .map((s: any) => s.id);
  
  if (unsyncedSessionIds.length > 0) {
    console.log(`[AutoSync] Auto-syncing ${unsyncedSessionIds.length} unsynced sessions to Google Calendar for goal "${goal.title}"`);
    try {
      await guardianCore.syncCalendar(goal.id, unsyncedSessionIds, accessToken);
    } catch (err: any) {
      console.warn(`[AutoSync] Failed to auto-sync calendar:`, err.message);
    }
  }
}

// 1. Get all goals
router.get("/", async (req, res) => {
  try {
    const goals = await goalService.getAll();
    res.json(goals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Submit a goal → GuardianCore façade
router.post("/", async (req, res) => {
  const { title, deadline, context } = req.body;
  if (!title || !deadline) {
    return res.status(400).json({ error: "Title and deadline are required" });
  }

  try {
    let newGoal = await guardianCore.createGoal(title, deadline, context);
    await autoSyncCalendarIfConnected(newGoal, req.cookies?.google_access_token);
    if (newGoal && newGoal.plan?.schedule?.some((s: any) => s.isSynced)) {
      const refreshed = await goalRepository.findById(newGoal.id);
      if (refreshed) newGoal = refreshed;
    }
    res.status(201).json(newGoal);
  } catch (err: any) {
    console.error("Failed to execute cognitive cycle:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 3. Parse natural language goal query
router.post("/parse", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }
  try {
    const parsed = await parseNaturalLanguageGoal(query);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Save answers to clarifying questions → GuardianCore
router.post("/:id/clarify", async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body;

  try {
    let goal = await guardianCore.generatePlan(id, answers);
    await autoSyncCalendarIfConnected(goal, req.cookies?.google_access_token);
    if (goal && goal.plan?.schedule?.some((s: any) => s.isSynced)) {
      const refreshed = await goalRepository.findById(goal.id);
      if (refreshed) goal = refreshed;
    }
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 5. Force plan generation → GuardianCore
router.post("/:id/plan", async (req, res) => {
  const { id } = req.params;
  try {
    let goal = await guardianCore.forcePlan(id);
    await autoSyncCalendarIfConnected(goal, req.cookies?.google_access_token);
    if (goal && goal.plan?.schedule?.some((s: any) => s.isSynced)) {
      const refreshed = await goalRepository.findById(goal.id);
      if (refreshed) goal = refreshed;
    }
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 6. Toggle task completion → GuardianCore
router.post("/:id/tasks/:taskId/complete", async (req, res) => {
  const { id, taskId } = req.params;
  const { isCompleted } = req.body;

  try {
    const goal = await guardianCore.completeTask(id, taskId, isCompleted);
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 7. Trigger execution assistance → GuardianCore
router.post("/:id/tasks/:taskId/execute", async (req, res) => {
  const { id, taskId } = req.params;
  const { userPrompt } = req.body;

  try {
    const goal = await guardianCore.executeTask(id, taskId, userPrompt);
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 8. Sync calendar → GuardianCore
router.post("/:id/sync", async (req, res) => {
  const { id } = req.params;
  const { sessionIds } = req.body;
  const accessToken = req.cookies?.google_access_token;

  try {
    const updatedGoal = await guardianCore.syncCalendar(id, sessionIds, accessToken);
    res.json(updatedGoal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 9. Recovery evaluation → GuardianCore
router.post("/:id/recovery", async (req, res) => {
  const { id } = req.params;
  try {
    const goal = await guardianCore.evaluateRecovery(id);
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 10. Apply recovery → GuardianCore
router.post("/:id/apply-recovery", async (req, res) => {
  const { id } = req.params;
  try {
    let goal = await guardianCore.applyRecovery(id);
    await autoSyncCalendarIfConnected(goal, req.cookies?.google_access_token);
    if (goal && goal.plan?.schedule?.some((s: any) => s.isSynced)) {
      const refreshed = await goalRepository.findById(goal.id);
      if (refreshed) goal = refreshed;
    }
    res.json(goal);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11. Chat → GuardianCore
router.post("/:id/chat", async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }
  try {
    const { responseMessage, goal } = await guardianCore.processConversation(id, message);
    let finalGoal = goal;
    if (finalGoal) {
      await autoSyncCalendarIfConnected(finalGoal, req.cookies?.google_access_token);
      if (finalGoal.plan?.schedule?.some((s: any) => s.isSynced)) {
        const refreshed = await goalRepository.findById(finalGoal.id);
        if (refreshed) finalGoal = refreshed;
      }
    }
    res.json({ responseMessage, goal: finalGoal });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 12. Delete a goal → GuardianCore
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Clean up synced events from Google Calendar before deleting the goal
    const goal = await goalRepository.findById(id);
    if (goal && goal.plan?.schedule && req.cookies?.google_access_token) {
      const syncedSessionIds = goal.plan.schedule.map((s: any) => s.id);
      if (syncedSessionIds.length > 0) {
        const framework = ToolExecutionFramework.getInstance();
        try {
          const adapter = framework.getAdapter("google_calendar");
          if (adapter && adapter.rollback) {
            await adapter.rollback("sync_sessions", { syncedSessionIds, goalId: id }, req.cookies.google_access_token);
          }
        } catch (err: any) {
          console.warn("[AutoSync] Clean up of calendar events on goal delete failed:", err.message);
        }
      }
    }
    await guardianCore.deleteGoal(id);
    res.json({ success: true, message: "Goal deleted successfully" });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 13. Research — get packages
router.get("/:id/research", async (req, res) => {
  const { id } = req.params;
  try {
    const pkgs = await researchService.getPackagesByGoalId(id);
    res.json(pkgs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Research — manually trigger → GuardianCore
router.post("/:id/research/trigger", async (req, res) => {
  const { id } = req.params;
  try {
    const pkg = await guardianCore.triggerResearch(id);
    res.json(pkg);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
