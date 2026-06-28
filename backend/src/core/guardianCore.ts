/**
 * Core: GuardianCore Façade (§18.7)
 * 
 * THE single entry point for all business intelligence.
 * 
 * Uses the Coordinator pattern to prevent becoming a God Object:
 * - GoalCoordinator: goal lifecycle
 * - PlanningCoordinator: plan generation and clarification
 * - ConversationCoordinator: chat interactions
 * - ExecutionCoordinator: task execution and completion
 * - RecoveryCoordinator: recovery evaluation and application
 * - ResearchCoordinator: research intelligence
 * - CalendarCoordinator: calendar synchronization
 * 
 * Controllers never call individual services directly.
 * Everything enters through GuardianCore.
 */
import type { IGuardianCore } from "./interfaces.js";
import type { Goal, ResearchPackage } from "../types.js";
import { CognitiveEngine } from "../cognitive/engine.js";
import {
  runPlanningAndScheduling,
  runExecutionAssistance,
  runProgressAndRecoveryEvaluation,
  runGoalChatUpdate,
} from "../agents.js";
import { goalService } from "../domain/goals/goalService.js";
import { researchService } from "../domain/research/researchService.js";
import { calendarService } from "../domain/calendar/calendarService.js";
import { logEpisodicMemory } from "../cognitive/memory.js";
import { goalRepository } from "../infrastructure/repositories/goalRepository.js";
import { NotFoundError, ValidationError, DomainError } from "../infrastructure/errors.js";
import { evaluateProgressDeterministically } from "../cognitive/cognitiveRouter.js";

// ─── Coordinator Classes ────────────────────────────────────────────────────

class GoalCoordinator {
  async create(title: string, deadline: string, context: string): Promise<Goal> {
    const engine = new CognitiveEngine();
    console.log(`[GoalCoordinator] Creating goal: "${title}" due: "${deadline}"`);
    return engine.runGoalCreationCycle(title, deadline, context);
  }

  async update(goal: Goal, changedFields?: string[]): Promise<Goal> {
    return goalService.update(goal, changedFields);
  }

  async delete(id: string): Promise<void> {
    return goalService.delete(id);
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class PlanningCoordinator {
  async generatePlan(goalId: string, answers?: Record<string, string>): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    console.log(`[PlanningCoordinator] Generating plan for: "${goal.title}"`);
    if (goal.clarification && answers) {
      goal.clarification.answers = answers;
    }

    const planResult = await runPlanningAndScheduling(
      goal.title,
      goal.deadline,
      goal.context,
      goal.analysis,
      answers || {}
    );

    goal.plan = planResult;

    const progressResult = await runProgressAndRecoveryEvaluation(goal);
    goal.progress = progressResult;

    await goalService.update(goal, ["plan", "progress"]);
    return goal;
  }

  async forcePlan(goalId: string): Promise<Goal> {
    return this.generatePlan(goalId, {});
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class ConversationCoordinator {
  async process(goalId: string, message: string): Promise<{ responseMessage: string; goal: Goal | null }> {
    const goal = await this.requireGoal(goalId);

    console.log(`[ConversationCoordinator] Processing message for goal: "${goal.title}"`);
    const { responseMessage, updatedGoal } = await runGoalChatUpdate(goal, message);

    if (updatedGoal && updatedGoal.plan) {
      const progressResult = await runProgressAndRecoveryEvaluation(updatedGoal);
      updatedGoal.progress = progressResult;
      await goalService.update(updatedGoal, ["plan", "progress"]);
    }

    return { responseMessage, goal: updatedGoal };
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class ExecutionCoordinator {
  async executeTask(goalId: string, taskId: string, userPrompt: string): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    if (!goal.plan?.tasks) throw new DomainError("Goal plan does not exist yet");

    const task = goal.plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundError("Task", taskId);

    console.log(`[ExecutionCoordinator] Running execution for task: "${task.title}"`);
    const executionResult = await runExecutionAssistance(
      goal.title,
      task.title,
      task.description,
      userPrompt
    );

    task.aiAssistance = {
      generatedAt: new Date().toISOString(),
      assetType: executionResult.assetType,
      content: executionResult.content,
    };

    await goalService.update(goal, ["plan"]);
    return goal;
  }

  async completeTask(goalId: string, taskId: string, isCompleted: boolean): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    if (!goal.plan?.tasks) throw new DomainError("Goal plan does not exist yet");

    const taskIndex = goal.plan.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) throw new NotFoundError("Task", taskId);

    goal.plan.tasks[taskIndex].isCompleted = isCompleted;
    goal.plan.tasks[taskIndex].completedAt = isCompleted ? new Date().toISOString() : null;

    // Evaluate milestone progress
    this.evaluateMilestoneProgress(goal);

    // Use DETERMINISTIC progress evaluation first (0 Gemini calls)
    console.log(`[ExecutionCoordinator] Evaluating progress deterministically for: "${goal.title}"`);
    const deterministicProgress = evaluateProgressDeterministically(goal);
    
    // Only invoke Gemini-based recovery evaluation when risk is genuinely elevated
    if (deterministicProgress.currentRiskLevel === "High") {
      console.log(`[ExecutionCoordinator] High risk detected — invoking LLM-based recovery evaluation`);
      const progressResult = await runProgressAndRecoveryEvaluation(goal);
      goal.progress = progressResult;
    } else {
      // Use the deterministic result directly (saves 1 Gemini call per toggle)
      goal.progress = deterministicProgress;
    }

    await goalService.update(goal, ["plan", "progress"]);
    return goal;
  }

  private evaluateMilestoneProgress(goal: Goal): void {
    if (!goal.plan) return;
    if (!goal.plan.milestones) goal.plan.milestones = [];
    if (!goal.plan.tasks) goal.plan.tasks = [];

    goal.plan.milestones.forEach((m) => {
      const childTasks = goal.plan!.tasks.filter((t) => t.relatedMilestoneId === m.id);
      if (childTasks.length > 0) {
        const allCompleted = childTasks.every((t) => t.isCompleted);
        const someCompleted = childTasks.some((t) => t.isCompleted);
        if (allCompleted) m.status = "completed";
        else if (someCompleted) m.status = "in_progress";
        else m.status = "pending";
      }
    });

    const totalMilestones = goal.plan.milestones.length;
    if (totalMilestones > 0) {
      goal.status = goal.plan.milestones.every((m) => m.status === "completed") ? "completed" : "active";
    } else {
      const totalTasks = goal.plan.tasks.length;
      if (totalTasks > 0) {
        goal.status = goal.plan.tasks.every((t) => t.isCompleted) ? "completed" : "active";
      }
    }
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class RecoveryCoordinator {
  async evaluate(goalId: string): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    console.log(`[RecoveryCoordinator] Evaluating recovery for: "${goal.title}"`);
    const progressResult = await runProgressAndRecoveryEvaluation(goal);
    goal.progress = progressResult;

    await goalService.update(goal, ["progress"]);
    return goal;
  }

  async apply(goalId: string): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    console.log(`[RecoveryCoordinator] Applying recovery plan for: "${goal.title}"`);

    if (goal.plan?.tasks && goal.progress?.recoveryPlan?.revisedTasks) {
      goal.progress.recoveryPlan.revisedTasks.forEach((rev: any) => {
        const task = goal.plan!.tasks.find((t: any) => t.id === rev.taskId);
        if (task) {
          task.estimatedMinutes = rev.revisedEstimate;
          if (!task.title.includes("(Rescue Scope)")) {
            task.title = `${task.title} (Rescue Scope)`;
          }
        }
      });

      if (goal.plan.schedule) {
        goal.plan.schedule.forEach((session) => {
          const task = goal.plan!.tasks.find((t: any) => t.id === session.taskId);
          if (task) {
            const startParts = session.startTime.split(":");
            const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
            const endMin = startMin + task.estimatedMinutes;
            const endHour = Math.floor(endMin / 60) % 24;
            const endMinute = endMin % 60;
            session.endTime = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
            if (!session.title.includes("(Rescue Scope)")) {
              session.title = `${session.title} (Rescue Scope)`;
            }
            session.isSynced = false;
          }
        });
      }
    }

    const progressResult = await runProgressAndRecoveryEvaluation(goal);
    goal.progress = progressResult;

    await logEpisodicMemory(
      ["User", "Guardian Core"],
      `Recovery plan activated: "${goal.title}"`,
      [goal.id],
      ["Applied scope compression and compressed work estimates to tasks."]
    );

    await goalService.update(goal, ["plan", "progress"]);
    return goal;
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class ResearchCoordinator {
  async trigger(goalId: string): Promise<ResearchPackage> {
    const goal = await this.requireGoal(goalId);
    console.log(`[ResearchCoordinator] Triggering research for: "${goal.title}"`);
    return researchService.triggerResearch(goal.id, goal.title, goal.context);
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

class CalendarCoordinator {
  async sync(goalId: string, sessionIds: string[], accessToken?: string): Promise<Goal> {
    const goal = await this.requireGoal(goalId);

    if (!goal.plan?.schedule) throw new DomainError("No calendar sessions found");

    console.log(`[CalendarCoordinator] Syncing calendar for: "${goal.title}"`);
    return calendarService.syncGoalSessions(goal, sessionIds, accessToken);
  }

  private async requireGoal(goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(goalId);
    if (!goal) throw new NotFoundError("Goal", goalId);
    return goal;
  }
}

// ─── GuardianCore Façade ────────────────────────────────────────────────────

export class GuardianCore implements IGuardianCore {
  private goalCoordinator = new GoalCoordinator();
  private planningCoordinator = new PlanningCoordinator();
  private conversationCoordinator = new ConversationCoordinator();
  private executionCoordinator = new ExecutionCoordinator();
  private recoveryCoordinator = new RecoveryCoordinator();
  private researchCoordinator = new ResearchCoordinator();
  private calendarCoordinator = new CalendarCoordinator();

  // ─── Goal Lifecycle ───────────────────────────────────────────────────

  async createGoal(title: string, deadline: string, context: string): Promise<Goal> {
    return this.goalCoordinator.create(title, deadline, context);
  }

  async updateGoal(goal: Goal, changedFields?: string[]): Promise<Goal> {
    return this.goalCoordinator.update(goal, changedFields);
  }

  async deleteGoal(id: string): Promise<void> {
    return this.goalCoordinator.delete(id);
  }

  // ─── Conversation ─────────────────────────────────────────────────────

  async processConversation(goalId: string, message: string): Promise<{ responseMessage: string; goal: Goal | null }> {
    return this.conversationCoordinator.process(goalId, message);
  }

  // ─── Planning ─────────────────────────────────────────────────────────

  async generatePlan(goalId: string, answers?: Record<string, string>): Promise<Goal> {
    return this.planningCoordinator.generatePlan(goalId, answers);
  }

  async forcePlan(goalId: string): Promise<Goal> {
    return this.planningCoordinator.forcePlan(goalId);
  }

  // ─── Execution ────────────────────────────────────────────────────────

  async executeTask(goalId: string, taskId: string, userPrompt: string): Promise<Goal> {
    return this.executionCoordinator.executeTask(goalId, taskId, userPrompt);
  }

  async completeTask(goalId: string, taskId: string, isCompleted: boolean): Promise<Goal> {
    return this.executionCoordinator.completeTask(goalId, taskId, isCompleted);
  }

  // ─── Recovery ─────────────────────────────────────────────────────────

  async evaluateRecovery(goalId: string): Promise<Goal> {
    return this.recoveryCoordinator.evaluate(goalId);
  }

  async applyRecovery(goalId: string): Promise<Goal> {
    return this.recoveryCoordinator.apply(goalId);
  }

  // ─── Research ─────────────────────────────────────────────────────────

  async triggerResearch(goalId: string): Promise<ResearchPackage> {
    return this.researchCoordinator.trigger(goalId);
  }

  // ─── Calendar ─────────────────────────────────────────────────────────

  async syncCalendar(goalId: string, sessionIds: string[], accessToken?: string): Promise<Goal> {
    return this.calendarCoordinator.sync(goalId, sessionIds, accessToken);
  }
}

/** Singleton instance */
export const guardianCore = new GuardianCore();
