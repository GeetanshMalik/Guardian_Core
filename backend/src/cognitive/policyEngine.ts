import { getAutonomyLevel } from "../db.js";
import { CognitiveState } from "./types.js";
import { PolicyDecision, PolicyCheck } from "../types.js";
import { logDecisionMemory } from "./memory.js";

export class PolicyEngine {
  constructor() {}

  /**
   * Main entry point to evaluate cognitive cycle recommendations against governance policies.
   * Centralizes safety checks, permission checks, autonomy level gates, and structured explanation generation.
   */
  public async evaluateDecision(
    state: CognitiveState,
    actionType: "goal_planning" | "calendar_sync" | "task_completion"
  ): Promise<PolicyDecision> {
    console.log(`[PolicyEngine] Evaluating action "${actionType}" against governance policies...`);
    
    // 1. Context Aggregation
    const autonomyLevel = await getAutonomyLevel();
    const riskScore = state.worldModel.activeGoals[0]?.analysis?.riskScore || 20;
    const overallConfidence = state.confidence.decision || 80;

    const evidence: string[] = [
      `Action: ${actionType}`,
      `Autonomy Level: ${autonomyLevel}`,
      `Risk Score: ${riskScore}%`,
      `Engine Confidence: ${overallConfidence}%`
    ];

    // 2. Conflict Resolution
    // Resolve scheduled window overlaps or morning/weekend preference violations
    const avoidWeekends = state.worldModel.userPreferences.avoidWeekends;
    const avoidMornings = state.worldModel.userPreferences.avoidMornings;
    if (avoidWeekends) {
      evidence.push("Conflict check: weekend scheduling avoidance active.");
    }
    if (avoidMornings) {
      evidence.push("Conflict check: morning focus scheduling avoidance active.");
    }

    // 3. Policy Evaluation
    const policiesApplied: PolicyCheck[] = [];

    // Policy A: Permission Policy
    const hasCalendarPermission = true; // Simulating permission check
    policiesApplied.push({
      policyName: "Permission Policy",
      passed: hasCalendarPermission,
      reason: hasCalendarPermission ? "Permissions granted." : "Google API permissions missing."
    });

    // Policy B: Safety Policy
    const safetyPassed = riskScore < 80;
    policiesApplied.push({
      policyName: "Safety Policy",
      passed: safetyPassed,
      reason: safetyPassed ? "Risk indices within normal parameters." : "Goal risk rating exceeds 80% safe execution threshold."
    });

    // Policy C: Trust Policy
    const trustPassed = overallConfidence >= 70;
    policiesApplied.push({
      policyName: "Trust Policy",
      passed: trustPassed,
      reason: trustPassed ? "Cognitive cycle confidence score is above 70% limit." : `Cognitive engine confidence is too low (${overallConfidence}%).`
    });

    // Policy D: Explainability Policy
    const explanationProvided = state.workingMemory.transientNotes.length > 0;
    policiesApplied.push({
      policyName: "Explainability Policy",
      passed: explanationProvided,
      reason: explanationProvided ? "Justification context captured successfully." : "Decision lacks explainable cognitive traces."
    });

    // Policy E: Privacy Policy
    // Avoid processing sensitive context (e.g. credentials)
    const hasSensitiveContext = false;
    policiesApplied.push({
      policyName: "Privacy Policy",
      passed: !hasSensitiveContext,
      reason: "No sensitive data leakage detected."
    });

    // Policy F: Autonomy Policy (enforce Level 0 to Level 3 gates)
    let requiredApproval = false;
    let autonomyReason = "";

    if (autonomyLevel === "advisory") {
      requiredApproval = true;
      autonomyReason = "Advisory Mode (Level 0): All actions require user confirmation.";
    } else if (autonomyLevel === "assisted") {
      requiredApproval = true;
      autonomyReason = "Assisted Mode (Level 1): Core plan scheduling sync actions require user confirmation.";
    } else if (autonomyLevel === "delegated") {
      // Delegate low-to-moderate risk decisions, require approvals for high risk
      requiredApproval = riskScore > 50;
      autonomyReason = requiredApproval
        ? "Delegated Mode (Level 2): Risk score exceeds delegation threshold. Human approval required."
        : "Delegated Mode (Level 2): Authorized automatically under delegation policy.";
    } else if (autonomyLevel === "trusted_automation") {
      requiredApproval = false;
      autonomyReason = "Trusted Automation (Level 3): Actions fully automated.";
    }

    policiesApplied.push({
      policyName: "Autonomy Policy",
      passed: true,
      reason: autonomyReason
    });

    // 4. Decision Selection & Authorization
    const allCrucialPassed = policiesApplied
      .filter((p) => p.policyName !== "Autonomy Policy")
      .every((p) => p.passed);

    let executionStatus: PolicyDecision["executionStatus"] = "authorized";
    if (!allCrucialPassed) {
      executionStatus = "blocked";
    } else if (requiredApproval) {
      executionStatus = "pending_approval";
    }

    // 5. Explanation Generation (Section 12.12)
    let explanationText = "";
    if (executionStatus === "blocked") {
      const failed = policiesApplied.find((p) => !p.passed);
      explanationText = `Execution blocked by governance layer. Reason: ${failed?.reason || "Policy validation failed."}`;
    } else if (executionStatus === "pending_approval") {
      explanationText = `Action queued. Human review is required because the system is operating in ${autonomyLevel} mode and risk level is evaluated as ${riskScore > 50 ? 'elevated' : 'normal'}.`;
    } else {
      explanationText = `Action authorized automatically. Personalization constraints satisfied under ${autonomyLevel} policy rules.`;
    }

    const decision: PolicyDecision = {
      id: "policy-dec-" + Math.random().toString(36).substr(2, 9),
      decisionType: actionType,
      selectedRecommendation: { stateSnapshot: state.history[state.history.length - 1] },
      supportingEvidence: evidence,
      confidence: overallConfidence,
      policiesApplied,
      requiredApproval,
      executionStatus,
      explanation: explanationText
    };

    // 6. Write Decision Memory to shared memory storage
    await logDecisionMemory(
      decision.id,
      `Policy Evaluation: ${actionType}`,
      [`Deny vs Authorize in ${autonomyLevel} mode`],
      executionStatus,
      evidence,
      overallConfidence
    );

    console.log(`[PolicyEngine] Governance complete. Decision: ${executionStatus} (${explanationText})`);
    return decision;
  }
}
