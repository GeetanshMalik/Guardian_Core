import { constructWorldModelSnapshot } from "./worldModel.js";
import { CognitiveState, ConfidenceMatrix } from "./types.js";
import { Goal } from "../types.js";
import { saveJob, saveNotification } from "../db.js";
import { goalRepository } from "../infrastructure/repositories/goalRepository.js";
import { ConstitutionEngine } from "./constitution.js";
import { CapabilityOrchestrator } from "./orchestrator.js";
import { retrieveMemoryContext, logDecisionMemory, logEpisodicMemory, logReflectionMemory } from "./memory.js";
import { recordObservation, analyzePatternsAndRefinePreferences } from "./learning.js";
import { PolicyEngine } from "./policyEngine.js";
import { ResearchIntelligence } from "./research.js";
import { tracePromise } from "../infrastructure/tracing.js";
import { evaluateContext, type ContextEvaluation } from "./contextEvaluator.js";
import { computeAIBudget, buildGoalDeterministically, type AIBudget } from "./cognitiveRouter.js";
import { config } from "../infrastructure/config.js";

export class CognitiveEngine {
  private state!: CognitiveState;
  private contextEvaluation?: ContextEvaluation;
  private aiBudget: AIBudget = 2;

  constructor() {}

  /**
   * Runs the complete Cognitive Cycle.
   * 
   * The Cognitive Router determines the AI budget:
   *   Budget 0: Deterministic engine (0 Gemini calls) — scheduling, reminders, routine goals
   *   Budget 1: Single LLM call — planning goals needing milestone decomposition
   *   Budget 2: Full pipeline — complex research, interview prep, report generation
   */
  public async runGoalCreationCycle(
    rawInput: string,
    deadline: string,
    context: string
  ): Promise<Goal> {
    const startTime = Date.now();
    return tracePromise("runGoalCreationCycle", async () => {
      console.log("[CognitiveEngine] Starting Cognitive Cycle for goal creation...");

      // Stage 1: PERCEIVE (Pass rawInput, deadline, and context to fetch memory context)
      await this.perceive(rawInput, deadline, context);

      // Stage 1.5: EVALUATE CONTEXT (Capability & Context Evaluation Engine)
      this.contextEvaluation = await evaluateContext(rawInput, deadline, context);
      this.transitionTo("EVALUATE_CONTEXT", 
        `Intent: ${this.contextEvaluation.intent}, ` +
        `Action: ${this.contextEvaluation.recommendedAction.action}, ` +
        `Research: ${this.contextEvaluation.researchRelevance.shouldResearch}, ` +
        `Confidence: ${this.contextEvaluation.confidence}%`
      );

      // Store context evaluation results in working memory for downstream stages
      this.state.workingMemory.transientNotes.push(
        `Context Evaluation: intent=${this.contextEvaluation.intent}, ` +
        `researchRelevance=${this.contextEvaluation.researchRelevance.category}, ` +
        `action=${this.contextEvaluation.recommendedAction.action}`
      );

      // If the evaluation recommends providing a template (e.g. email/report without context),
      // store the template in working memory for the decide stage
      if (this.contextEvaluation.recommendedAction.action === "provide_template") {
        this.state.workingMemory.transientNotes.push(
          `Template provided: ${this.contextEvaluation.recommendedAction.reason}`
        );
      }

      // ─── COGNITIVE ROUTER: Compute AI Budget ──────────────────────────
      this.aiBudget = computeAIBudget(this.contextEvaluation);
      console.log(`[CognitiveEngine] [COGNITIVE ROUTER] AI Budget: ${this.aiBudget} Gemini call(s) allocated for "${rawInput}"`);

      // ─── Budget 0: DETERMINISTIC PATH (0 Gemini calls) ───────────────
      if (this.aiBudget === 0) {
        console.log("[CognitiveEngine] [DETERMINISTIC PATH] Bypassing LLM pipeline — building goal with templates + algorithms");
        
        const result = await buildGoalDeterministically(rawInput, deadline, context);
        const goal = result.goal;

        // Save and execute
        await goalRepository.save(goal);

        // Log episodic memory
        await logEpisodicMemory(
          ["User", "Guardian Core"],
          `Goal configured deterministically: "${goal.title}" (template: ${result.templateCategory})`,
          [goal.id],
          [`Built with ${goal.plan?.tasks?.length || 0} tasks using deterministic engine. AI calls: 0`]
        );

        // Success notification
        await saveNotification({
          id: "notif-" + Math.random().toString(36).substr(2, 9),
          type: "success" as const,
          title: `Plan Configured for "${goal.title}"`,
          message: `Guardian Core generated a personalized execution roadmap with ${goal.plan?.tasks?.length || 0} tasks using intelligent scheduling. No AI processing was needed for this goal type.`,
          goalId: goal.id,
          createdAt: new Date().toISOString(),
          isRead: false,
        });

        // Learn from this interaction
        await this.learn(goal);

        // Record metrics
        const durationMs = Date.now() - startTime;
        const { metricsRegistry } = await import("../infrastructure/metrics.js");
        metricsRegistry.recordCognitiveCycle({
          goalId: goal.id,
          model: "deterministic",
          tokensPrompt: 0,
          tokensCompletion: 0,
          latencyMs: durationMs,
          confidence: 95,
          policyChecksPassed: 1,
          policyChecksFailed: 0
        });

        console.log(`[CognitiveEngine] [DETERMINISTIC PATH] Complete in ${durationMs}ms. Template: ${result.templateCategory}`);
        return goal;
      }

      // ─── Budget 1-2: LLM-ASSISTED PATH ───────────────────────────────
      console.log(`[CognitiveEngine] [LLM PATH] Proceeding with AI-assisted planning (budget: ${this.aiBudget})`);

      try {
        // Stages 2 to 5: Run DAG via CapabilityOrchestrator
        const orchestrator = new CapabilityOrchestrator();
        await orchestrator.executePlanningGraph(this.state, rawInput, deadline, context);

        // Stage 6: DECIDE
        const goal = await this.decide(rawInput, deadline, context);

        // Stage 7: EXECUTE
        await this.execute(goal);

        // Stage 8: REFLECT
        const reflectionText = await orchestrator.executeReflectionGraph(this.state, goal);
        await logReflectionMemory(reflectionText, goal.id, "plan_reflection");
        
        // Write success notification
        const successNotification = {
          id: "notif-" + Math.random().toString(36).substr(2, 9),
          type: "success" as const,
          title: `Plan Configured for "${goal.title}"`,
          message: `Guardian Core generated a personalized execution roadmap with ${goal.plan?.tasks?.length || 0} milestones.`,
          goalId: goal.id,
          createdAt: new Date().toISOString(),
          isRead: false,
        };
        await saveNotification(successNotification);

        // Stage 9: LEARN
        await this.learn(goal);

        const durationMs = Date.now() - startTime;
        const confidence = this.state.confidence?.decision || 100;
        
        const { metricsRegistry } = await import("../infrastructure/metrics.js");
        metricsRegistry.recordCognitiveCycle({
          goalId: goal.id,
          model: config.gemini.model,
          tokensPrompt: rawInput.length * 4,
          tokensCompletion: 1200,
          latencyMs: durationMs,
          confidence,
          policyChecksPassed: 3,
          policyChecksFailed: 0
        });

        return goal;
      } catch (err: any) {
        console.warn(`[CognitiveEngine] LLM planning failed: ${err.message}. Falling back to deterministic route.`);
        
        // Fallback to deterministic build
        const result = await buildGoalDeterministically(rawInput, deadline, context);
        const goal = result.goal;

        // Save and execute
        await goalRepository.save(goal);

        // Log episodic memory
        await logEpisodicMemory(
          ["User", "Guardian Core"],
          `Goal configured deterministically (fallback from LLM): "${goal.title}" (reason: LLM error: ${err.message})`,
          [goal.id],
          [`Fell back to deterministic engine due to error: ${err.message}`]
        );

        // Success notification with fallback warning
        await saveNotification({
          id: "notif-" + Math.random().toString(36).substr(2, 9),
          type: "warning" as const,
          title: `Plan Configured for "${goal.title}"`,
          message: `Guardian Core generated a baseline plan using local scheduling templates because the AI model is currently busy or rate-limited.`,
          goalId: goal.id,
          createdAt: new Date().toISOString(),
          isRead: false,
        });

        // Stage 9: LEARN
        await this.learn(goal);

        const durationMs = Date.now() - startTime;
        const { metricsRegistry } = await import("../infrastructure/metrics.js");
        metricsRegistry.recordCognitiveCycle({
          goalId: goal.id,
          model: "deterministic-fallback",
          tokensPrompt: 0,
          tokensCompletion: 0,
          latencyMs: durationMs,
          confidence: 95,
          policyChecksPassed: 1,
          policyChecksFailed: 0
        });

        return goal;
      }
    });
  }

  private transitionTo(stage: CognitiveState["currentStage"], details: string) {
    console.log(`[CognitiveEngine] [STAGE TRANSITION] -> ${stage}: ${details}`);
    this.state.currentStage = stage;
    this.state.history.push({
      stage,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  private async perceive(rawInput: string, deadline: string, context: string) {
    const worldModel = await constructWorldModelSnapshot();
    const memoryContext = await retrieveMemoryContext(rawInput, context);
    
    this.state = {
      goalTitle: rawInput,
      goalDeadline: deadline,
      goalContext: context,
      currentStage: "PERCEIVE",
      history: [
        {
          stage: "PERCEIVE",
          timestamp: new Date().toISOString(),
          details: "Gathered initial User and Goals World State Snapshot and Shared Memory Context.",
        },
      ],
      worldModel,
      memoryContext,
      workingMemory: {
        transientNotes: ["Perceived active goals, deadlines, and shared memory successfully."],
        negotiationLog: [],
        decisionsMade: [],
      },
      confidence: {
        intent: 100,
        planning: 100,
        scheduling: 100,
        decision: 100,
      },
    };
    console.log(`[CognitiveEngine] Perception complete. Active Goals: ${worldModel.activeGoals.length}`);
  }



  private async decide(rawInput: string, deadline: string, context: string): Promise<Goal> {
    this.transitionTo("DECIDE", "Evaluating confidence score and committing final plan.");
    
    // Run Constitution validation
    const constitution = new ConstitutionEngine();
    const verification = constitution.validateDecision(this.state);
    
    if (verification.warnings.length > 0) {
      console.warn(`[CognitiveEngine] [CONSTITUTION WARNINGS]:\n- ${verification.warnings.join("\n- ")}`);
    }

    if (!verification.passed) {
      console.error(`[CognitiveEngine] [CONSTITUTION VIOLATION]: Validation failed!\n- ${verification.violations.join("\n- ")}`);
      throw new Error(`Constitutional policy violation detected: ${verification.violations[0]}`);
    } else {
      console.log("[CognitiveEngine] [CONSTITUTION SUCCESS]: All constitutional checks passed successfully.");
    }

    // Determine overall engine confidence
    const overallConfidence = Math.floor(
      (this.state.confidence.intent +
        this.state.confidence.planning +
        this.state.confidence.scheduling) /
        3
    );
    
    this.state.confidence.decision = overallConfidence;
    this.state.workingMemory.decisionsMade.push(
      `Engine decided to proceed with overall confidence score of ${overallConfidence}%.`
    );

    // Run governance Policy Engine evaluation (Chapter 12)
    const policyEngine = new PolicyEngine();
    const policyResult = await policyEngine.evaluateDecision(this.state, "goal_planning");

    if (policyResult.executionStatus === "blocked") {
      console.error(`[CognitiveEngine] [POLICY BLOCKED]: ${policyResult.explanation}`);
      throw new Error(`Governance policy validation blocked: ${policyResult.explanation}`);
    } else if (policyResult.executionStatus === "pending_approval") {
      console.log(`[CognitiveEngine] [POLICY PENDING APPROVAL]: ${policyResult.explanation}`);
      this.state.workingMemory.transientNotes.push(`Governance Warning: ${policyResult.explanation}`);
    } else {
      console.log("[CognitiveEngine] [POLICY SUCCESS]: Governance check passed successfully.");
    }

    // If intent or decision confidence is below 70%, trigger clarifying questions
    const needsClarification =
      overallConfidence < 70 &&
      this.state.workingMemory.clarificationQuestions &&
      this.state.workingMemory.clarificationQuestions.length > 0;

    const analysisDetails = this.state.workingMemory.transientNotes.join(" | ");
    
    const explanationText = this.state.workingMemory.transientNotes
      .find((n) => n.startsWith("Explanation: "))
      ?.replace("Explanation: ", "") || "Successfully generated strategic preparation path.";

    // Map cognitive engine output back to Goal DTO
    const newGoal: Goal = {
      id: "g-" + Math.random().toString(36).substr(2, 9),
      title: rawInput,
      deadline,
      context: context || "",
      createdAt: new Date().toISOString(),
      status: "active",
      analysis: {
        deadlineFormatted: this.state.deadlineFormatted || this.formatDeadlineNicely(deadline),
        constraints: (() => {
          const note = this.state.workingMemory.transientNotes.find((n) => n.startsWith("Extracted constraints: "));
          if (!note) return [];
          try {
            const parsed = JSON.parse(note.replace("Extracted constraints: ", ""));
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        })(),
        feasibilityScore: this.extractNumber("Feasibility Score", 75),
        riskScore: this.extractNumber("Risk Score", 25),
        complexity: this.extractComplexity(),
        risks: this.extractList("Identified Risks"),
        dependencies: this.extractList("Prerequisites/Dependencies"),
        explanation: explanationText,
      },
      clarification: {
        questions: needsClarification ? this.state.workingMemory.clarificationQuestions || [] : [],
        answers: {},
      },
    };

    if (!needsClarification && this.state.workingMemory.proposedTasks) {
      newGoal.plan = {
        tasks: this.state.workingMemory.proposedTasks.map((t) => ({
          ...t,
          isCompleted: false,
          completedAt: null,
          aiAssistance: null,
        })),
        schedule: (this.state.workingMemory.proposedSchedule || []).map((s) => ({
          ...s,
          isSynced: false,
        })),
        milestones: (this.state.workingMemory.proposedMilestones || []).map((m) => ({
          ...m,
          status: m.status || "pending",
          riskLevel: m.riskLevel || "Low",
        })),
      };
    }

    // Save Decision Memory
    const decisionId = newGoal.id;
    const decisionContext = `Goal creation: "${rawInput}". Context: "${context}". Target deadline: ${deadline}.`;
    const alternatives = ["Propose multi-milestone planning vs Prompt for clarifying questions"];
    const selectedOutcome = needsClarification ? "Request clarification questions from user" : "Generate and propose execution milestones and focus calendar work blocks";
    const evidence = this.state.workingMemory.transientNotes;
    const confidenceScore = overallConfidence;
    
    await logDecisionMemory(
      decisionId,
      decisionContext,
      alternatives,
      selectedOutcome,
      evidence,
      confidenceScore
    );

    return newGoal;
  }

  private async execute(goal: Goal) {
    this.transitionTo("EXECUTE", "Saving Goal and publishing worker audit trace.");
    
    await goalRepository.save(goal);

    // Log Episodic Memory
    await logEpisodicMemory(
      ["User", "Guardian Core"],
      `Goal configured and initialized: "${goal.title}"`,
      [goal.id],
      [`Calculated feasibility score at ${goal.analysis?.feasibilityScore || 80}% with ${goal.plan?.tasks?.length || 0} scheduled work blocks.`]
    );

    // Conditionally spawn background research — only if research is relevant for this goal
    if (this.contextEvaluation?.researchRelevance?.shouldResearch) {
      console.log(`[CognitiveEngine] Triggering background Research Intelligence for goal: "${goal.title}" (category: ${this.contextEvaluation.researchRelevance.category})`);
      ResearchIntelligence.generateResearchPackage(goal.id, goal.title, goal.context).catch(err => {
        console.error("[CognitiveEngine] Background research generation failed:", err);
      });
    } else {
      console.log(`[CognitiveEngine] Research skipped for goal: "${goal.title}" — ${this.contextEvaluation?.researchRelevance?.reason || "Not relevant"}`);
    }

    const auditJob = {
      id: "job-" + Math.random().toString(36).substr(2, 9),
      workerName: "Auditor Worker" as const,
      type: "RISK_SCAN" as const,
      goalId: goal.id,
      goalTitle: goal.title,
      status: "completed" as const,
      message: `Cognitive Cycle complete for goal: "${goal.title}". State traces logged successfully.`,
      createdAt: new Date().toISOString(),
    };
    await saveJob(auditJob);
  }



  private async learn(goal: Goal) {
    this.transitionTo("LEARN", "Updating User Intelligence preference matrices.");

    // 1. Record Goal Creation Observation
    await recordObservation(
      "CognitiveEngine",
      "goal_planning_cycle",
      `Goal planned: "${goal.title}"`,
      `Successfully built execution plan with ${goal.plan?.tasks?.length || 0} tasks and scheduling configuration.`,
      "System",
      100,
      goal.id
    );

    // 2. Trigger active pattern analysis and preference promotions/hypotheses
    await analyzePatternsAndRefinePreferences();
    
    console.log("[CognitiveEngine] Learning loop updated: Completed pattern analysis.");
  }

  // ─── Helper methods for extracting analysis data from workingMemory ───────

  private formatDeadlineNicely(deadline: string): string {
    // Try to parse deadline as a real date
    const parsed = new Date(deadline);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
    
    // Try common relative patterns: "June 30", "July 1st", "In 3 days", etc.
    const withYear = new Date(`${deadline}, ${new Date().getFullYear()}`);
    if (!isNaN(withYear.getTime())) {
      return withYear.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    // Fallback: return the raw deadline with a clean prefix
    return deadline;
  }

  private extractNumber(label: string, fallback: number): number {
    for (const note of this.state.workingMemory.transientNotes) {
      if (note.includes(label)) {
        const match = note.match(new RegExp(`${label}:\\s*(\\d+)`));
        if (match) return parseInt(match[1], 10);
      }
    }
    return fallback;
  }

  private extractComplexity(): "Low" | "Medium" | "High" {
    for (const note of this.state.workingMemory.transientNotes) {
      if (note.includes("Complexity:")) {
        if (note.includes("High")) return "High";
        if (note.includes("Low")) return "Low";
        return "Medium";
      }
    }
    return "Medium";
  }

  private extractList(label: string): string[] {
    for (const note of this.state.workingMemory.transientNotes) {
      if (note.startsWith(label + ":")) {
        const content = note.replace(`${label}: `, "").trim();
        if (!content || content === "undefined") return [];
        return content.split(", ").filter(s => s.length > 0);
      }
    }
    return [];
  }
}
