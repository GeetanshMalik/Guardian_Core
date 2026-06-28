/**
 * Repository: Goals (§18.9)
 * 
 * Domain-specific persistence wrapper around db.ts.
 * Exposes rich domain queries, not just CRUD.
 */
import {
  getGoals,
  getGoalById,
  saveGoal,
  deleteGoal,
  getMilestones,
  getMilestonesByGoalId,
  saveMilestone,
  getTasks,
  getTasksByGoalId,
  saveTask,
} from "../../db.js";
import type { IGoalRepository } from "../../core/interfaces.js";
import type { Goal, Milestone, Task } from "../../types.js";

export class GoalRepository implements IGoalRepository {
  async findAll(): Promise<Goal[]> {
    const goals = await getGoals();
    const allMilestones = await getMilestones();
    const allTasks = await getTasks();

    return goals.map((g) => {
      const milestones = allMilestones.filter((m) => m.goalId === g.id);
      const tasks = allTasks.filter((t) => t.goalId === g.id);

      if (milestones.length > 0 || tasks.length > 0) {
        if (!g.plan) g.plan = { tasks: [], schedule: [] };
        g.plan.milestones = milestones;
        g.plan.tasks = tasks;
      }
      return g;
    });
  }

  async findById(id: string): Promise<Goal | undefined> {
    const goal = await getGoalById(id);
    if (!goal) return undefined;

    const milestones = await getMilestonesByGoalId(id);
    const tasks = await getTasksByGoalId(id);

    if (milestones.length > 0 || tasks.length > 0) {
      if (!goal.plan) goal.plan = { tasks: [], schedule: [] };
      goal.plan.milestones = milestones;
      goal.plan.tasks = tasks;
    }

    return goal;
  }

  async save(goal: Goal): Promise<void> {
    // Deep clone to avoid mutating in-memory structures
    const dbGoal = JSON.parse(JSON.stringify(goal));

    const milestones: Milestone[] = dbGoal.plan?.milestones || [];
    const tasks: Task[] = dbGoal.plan?.tasks || [];

    if (dbGoal.plan) {
      delete dbGoal.plan.milestones;
      delete dbGoal.plan.tasks;
    }

    // Save the lightweight goal
    await saveGoal(dbGoal);

    // Save flat milestones
    for (const milestone of milestones) {
      milestone.goalId = goal.id;
      await saveMilestone(milestone);
    }

    // Save flat tasks
    for (const task of tasks) {
      task.goalId = goal.id;
      await saveTask(task);
    }
  }

  async delete(id: string): Promise<void> {
    await deleteGoal(id);
  }

  // ─── Domain Queries ─────────────────────────────────────────────────────

  async findByStatus(status: Goal["status"]): Promise<Goal[]> {
    const goals = await this.findAll();
    return goals.filter((g) => g.status === status);
  }

  async findGoalsAtRisk(): Promise<Goal[]> {
    const goals = await this.findAll();
    return goals.filter(
      (g) =>
        g.status === "active" &&
        g.progress &&
        (g.progress.currentRiskLevel === "High" || g.progress.procrastinationIndicator > 70)
    );
  }

  async findGoalsDueSoon(withinDays: number): Promise<Goal[]> {
    const goals = await this.findAll();
    const now = Date.now();
    const cutoff = now + withinDays * 24 * 60 * 60 * 1000;

    return goals.filter((g) => {
      if (g.status !== "active") return false;
      const deadlineTs = new Date(g.deadline).getTime();
      return deadlineTs <= cutoff && deadlineTs >= now;
    });
  }

  async findGoalsNeedingRecovery(): Promise<Goal[]> {
    const goals = await this.findAll();
    return goals.filter(
      (g) =>
        g.status === "active" &&
        g.progress?.recoveryPlan !== null &&
        g.progress?.recoveryPlan !== undefined
    );
  }
}

export const goalRepository = new GoalRepository();
