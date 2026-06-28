import { CognitiveState } from "./types.js";

export interface ConstitutionalCheckResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
}

export class ConstitutionEngine {
  constructor() {}

  /**
   * Evaluates proposed actions and cognitive state against immutable Articles.
   */
  public validateDecision(state: CognitiveState): ConstitutionalCheckResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    // Article I: Human Authority
    // Critical actions (like final OAuth token refreshes or executing a sync to Google Calendar)
    // must always verify that they have user approvals or explicit user triggers.
    const proposedActions = state.workingMemory.transientNotes;
    const hasSyncAttempt = proposedActions.some(
      (n) => n.toLowerCase().includes("calendar sync") || n.toLowerCase().includes("google api")
    );
    // Since this is the initial plan generation stage, calendar sync should NOT occur automatically.
    // Sync is operational but must wait for the user to explicitly invoke the sync endpoint.
    if (hasSyncAttempt) {
      violations.push(
        "Violation (Article I): Silently attempted Google Calendar API sync during planning phase. External modifications require explicit approval."
      );
    }

    // Article II: Honest Intelligence
    // Ensure verbiage of transient logs matches actual state of execution.
    const hasSentVerbiage = proposedActions.some(
      (n) => n.toLowerCase().includes("sent email") || n.toLowerCase().includes("synced calendar")
    );
    if (hasSentVerbiage) {
      violations.push(
        "Violation (Article II): Claiming an external action was completed when only local planning has occurred."
      );
    }

    // Article III: Explainability
    // Verify that the planning stage produced explanations/rationales.
    const hasExplanationNotes = proposedActions.some(
      (n) => n.toLowerCase().includes("explanation") || n.toLowerCase().includes("justification")
    );
    if (!hasExplanationNotes) {
      warnings.push(
        "Warning (Article III): Planning notes do not explicitly document the rationale for the generated timelines."
      );
    }

    // Article IV: Least Surprise
    // Warn if the planning contains extremely dense scheduling block (e.g. >3 sessions a day).
    if (state.workingMemory.proposedSchedule && state.workingMemory.proposedSchedule.length > 6) {
      warnings.push(
        "Warning (Article IV): The proposed timeline contains high calendar density, which may cause user fatigue."
      );
    }

    // Article V: Progressive Autonomy
    // Verify that the user preferences avoidance rules (avoidWeekends) are respected.
    const avoidWeekends = state.worldModel.userPreferences.avoidWeekends;
    const containsWeekendSession = state.workingMemory.proposedSchedule?.some((session) => {
      const day = new Date(session.date).getDay();
      return day === 0 || day === 6;
    });
    if (avoidWeekends && containsWeekendSession) {
      violations.push(
        "Violation (Article V): Proposed weekend slots violate the user's explicit preference matrix boundaries."
      );
    }

    const passed = violations.length === 0;

    return {
      passed,
      violations,
      warnings,
    };
  }
}
