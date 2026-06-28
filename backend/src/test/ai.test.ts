import { describe, it, beforeEach, expect, resetDatabase } from "./framework.js";
import { runPlanningAndScheduling, runExecutionAssistance, runProgressAndRecoveryEvaluation } from "../agents.js";
import { retrieveMemoryContext, logEpisodicMemory, logReflectionMemory } from "../cognitive/memory.js";
import { recordObservation, analyzePatternsAndRefinePreferences, decayConfidenceScores } from "../cognitive/learning.js";
import { PolicyEngine } from "../cognitive/policyEngine.js";
import { saveSemanticMemory, savePreferenceMemory, getPreferenceMemories, saveAutonomyLevel } from "../db.js";
import { CognitiveState } from "../cognitive/types.js";
import { Goal } from "../types.js";

describe("AI & Cognition: Prompt Generation Schema", () => {
  it("should generate schema-compliant mock planning response", async () => {
    const plan = await runPlanningAndScheduling(
      "Design Chapter 25 Tests",
      "2026-06-30",
      "Premium test quality",
      { feasibilityScore: 80, risks: [] }
    );
    expect(plan).toExist();
    expect(plan.tasks.length).toBe(3);
    expect(plan.tasks[0].title).toBe("Initial research and outline");
    expect(plan.schedule.length).toBe(3);
  });

  it("should generate compliant execution assistance logs", async () => {
    const assistance = await runExecutionAssistance(
      "Test Chapter 25 Suite",
      "Create test runner",
      "Develop framework.ts and run.ts",
      "Please give me a bash script to execute the tests"
    );
    expect(assistance).toExist();
    expect(assistance.assetType).toBe("Draft Outline & Guide");
    expect(assistance.content).toContain("Execution Blueprint");
  });

  it("should generate recovery plan recommendations under delay conditions", async () => {
    const mockGoal: Goal = {
      id: "goal-1",
      title: "Delayed Homework Task",
      deadline: "2026-06-27",
      context: "Failing behind due to illness",
      analysis: { deadlineFormatted: "June 27", constraints: [], feasibilityScore: 20, riskScore: 85, complexity: "High", risks: ["Health blockages"], dependencies: [] },
      status: "active",
      createdAt: new Date().toISOString(),
      plan: {
        tasks: [
          { id: "t1", title: "Task 1", description: "First task", estimatedMinutes: 60, dayNumber: 1, isCompleted: false, completedAt: null, aiAssistance: null, priority: "High", relatedMilestoneId: "m1" }
        ],
        schedule: []
      },
      progress: {
        currentRiskLevel: "High",
        procrastinationIndicator: 85,
        riskExplanations: ["Extremely high risk of missing deadline."],
        recoveryPlan: null
      }
    };

    const evaluation = await runProgressAndRecoveryEvaluation(mockGoal);
    expect(evaluation).toExist();
    expect(evaluation.currentRiskLevel).toBe("High");
    expect(evaluation.recoveryPlan).toExist();
    expect(evaluation.recoveryPlan?.summary).toContain("Recovery Plan");
  });
});

describe("AI & Cognition: Shared Memory Retrieval", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should rank memories correctly using keyword overlaps", async () => {
    // Save relevant semantic fact
    await saveSemanticMemory({
      id: "sem-1",
      fact: "The user struggles with math exams preparation and prefers evening practice",
      category: "preference",
      lastUpdated: new Date().toISOString()
    });

    // Save less relevant semantic fact
    await saveSemanticMemory({
      id: "sem-2",
      fact: "The user has a Google Drive folder for receipts storage",
      category: "tool_usage",
      lastUpdated: new Date().toISOString()
    });

    // Run retrieval targeting math exam preparation
    const context = await retrieveMemoryContext("Math Exam Prep Study Goal", "Needs schedule slots");
    
    expect(context.semanticFacts.length).toBeGreaterThan(0);
    expect(context.semanticFacts[0].id).toBe("sem-1"); // Matches "math" and "exam"
  });
});

describe("AI & Cognition: Learning Engine Preference Lifecycle", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should promote a preference to promoted when evidence threshold is met", async () => {
    // Record four observations for shift evening
    await recordObservation("scheduling", "calendar_shift_evening", "success", "Shifted study session to 19:30", "calendar_helper", 90);
    await recordObservation("scheduling", "calendar_shift_evening", "success", "Shifted review block to 20:00", "calendar_helper", 85);
    await recordObservation("scheduling", "calendar_shift_evening", "success", "User scheduled exam study at 19:00", "calendar_helper", 95);
    await recordObservation("scheduling", "calendar_shift_evening", "success", "Shifted work session to 19:45", "calendar_helper", 90);

    // Run analysis
    await analyzePatternsAndRefinePreferences();

    const preferences = await getPreferenceMemories();
    const windowPref = preferences.find(p => p.preferenceKey === "preferredStudyWindow");
    
    expect(windowPref).toExist();
    expect(windowPref?.status).toBe("promoted");
    expect(windowPref?.confidence).toBeGreaterThan(75);
    expect(windowPref?.evidenceCount).toBe(4);
  });

  it("should demote a preference back to hypothesis after time-decay simulation", async () => {
    // Setup a promoted preference memory
    await savePreferenceMemory({
      id: "pref-preferredStudyWindow",
      preferenceKey: "preferredStudyWindow",
      value: "19:00 - 21:00",
      confidence: 76, // Barely promoted
      evidenceCount: 3,
      source: "Learning Engine",
      lastUpdated: new Date().toISOString(),
      version: 2,
      status: "promoted"
    });

    // Run decay
    await decayConfidenceScores();

    const preferences = await getPreferenceMemories();
    const windowPref = preferences.find(p => p.preferenceKey === "preferredStudyWindow");

    expect(windowPref?.confidence).toBe(71); // 76 - 5 = 71
    expect(windowPref?.status).toBe("hypothesis"); // Dropped below 75 threshold
  });
});

describe("AI & Cognition: Policy Engine Autonomy Evaluation", () => {
  let mockState: CognitiveState;
  const policyEngine = new PolicyEngine();

  beforeEach(async () => {
    await resetDatabase();
    mockState = {
      currentStage: "DECIDE",
      history: [{ stage: "DECIDE", timestamp: new Date().toISOString(), details: "Policy check" }],
      worldModel: {
        timestamp: new Date().toISOString(),
        activeGoals: [{
          id: "goal-1",
          title: "Goal Title",
          deadline: "2026-07-01",
          context: "Context",
          analysis: { feasibilityScore: 90, riskScore: 30, complexity: "Low", risks: [], dependencies: [], constraints: [], deadlineFormatted: "July 1" },
          status: "active",
          createdAt: new Date().toISOString()
        }],
        upcomingDeadlines: [],
        userPreferences: {
          avoidWeekends: false,
          avoidMornings: false,
          workHoursStart: "19:00",
          workHoursEnd: "21:00",
          preferredSessionMinutes: 60
        }
      },
      memoryContext: {
        preferences: [],
        semanticFacts: [],
        recentEpisodes: [],
        historicalDecisions: [],
        activeReflections: []
      },
      workingMemory: { transientNotes: ["Decision rationale included"], negotiationLog: [], decisionsMade: [], proposedSchedule: [] },
      confidence: { intent: 90, planning: 95, scheduling: 90, decision: 92 }
    };
  });

  it("should pending_approval in advisory mode", async () => {
    await saveAutonomyLevel("advisory");
    const decision = await policyEngine.evaluateDecision(mockState, "calendar_sync");
    expect(decision.executionStatus).toBe("pending_approval");
    expect(decision.requiredApproval).toBe(true);
  });

  it("should authorize automatically under low risk in delegated mode", async () => {
    await saveAutonomyLevel("delegated");
    const decision = await policyEngine.evaluateDecision(mockState, "calendar_sync");
    expect(decision.executionStatus).toBe("authorized");
    expect(decision.requiredApproval).toBe(false);
  });

  it("should pending_approval under high risk (>50) in delegated mode", async () => {
    await saveAutonomyLevel("delegated");
    mockState.worldModel.activeGoals[0].analysis!.riskScore = 65; // High risk

    const decision = await policyEngine.evaluateDecision(mockState, "calendar_sync");
    expect(decision.executionStatus).toBe("pending_approval");
    expect(decision.requiredApproval).toBe(true);
  });

  it("should block execution when risk exceeds safety policy threshold (>80)", async () => {
    await saveAutonomyLevel("trusted_automation");
    mockState.worldModel.activeGoals[0].analysis!.riskScore = 85; // Too high for safety limits

    const decision = await policyEngine.evaluateDecision(mockState, "calendar_sync");
    expect(decision.executionStatus).toBe("blocked");
    expect(decision.explanation).toContain("blocked");
  });
});
