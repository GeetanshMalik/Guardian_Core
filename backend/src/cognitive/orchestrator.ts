import { CognitiveState } from "./types.js";
import {
  UnderstandingCapability,
  ReasoningCapability,
  PlanningCapability,
  NegotiationCapability,
  ReflectionCapability
} from "./capabilities/concrete.js";
import { Goal } from "../types.js";

export class CapabilityOrchestrator {
  private understanding = new UnderstandingCapability();
  private reasoning = new ReasoningCapability();
  private planning = new PlanningCapability();
  private negotiation = new NegotiationCapability();
  private reflection = new ReflectionCapability();

  constructor() {}

  /**
   * Executes the coordinated capability DAG for planning and scheduling.
   */
  public async executePlanningGraph(
    state: CognitiveState,
    title: string,
    deadline: string,
    context: string
  ): Promise<void> {
    console.log("[CapabilityOrchestrator] Assembling and executing capability DAG...");

    state.goalTitle = title;
    state.goalDeadline = deadline;
    state.goalContext = context;

    // 1. Run Understanding Capability
    console.log("[CapabilityOrchestrator] Executing UnderstandingCapability...");
    const understandOutput = await this.understanding.execute({
      payload: { title, deadline, context },
    });
    console.log(
      `[CapabilityOrchestrator] Completed UnderstandingCapability in ${understandOutput.metadata.durationMs}ms (Confidence: ${understandOutput.confidence}%)`
    );
    
    state.deadlineFormatted = (understandOutput.data as any).deadlineFormatted || new Date(deadline).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    state.workingMemory.transientNotes.push(
      `Extracted constraints: ${JSON.stringify(understandOutput.data.constraints)}`
    );
    state.workingMemory.clarificationQuestions = understandOutput.data.questions || [];
    state.confidence.intent = understandOutput.confidence;

    // 2. Run Reasoning Capability
    console.log("[CapabilityOrchestrator] Executing ReasoningCapability...");
    const reasonOutput = await this.reasoning.execute({
      payload: state,
    });
    console.log(
      `[CapabilityOrchestrator] Completed ReasoningCapability in ${reasonOutput.metadata.durationMs}ms (Confidence: ${reasonOutput.confidence}%)`
    );
    
    state.workingMemory.transientNotes.push(
      `Feasibility Score: ${reasonOutput.data.feasibilityScore}, Risk Score: ${reasonOutput.data.riskScore}, Complexity: ${reasonOutput.data.complexity}`
    );
    state.workingMemory.transientNotes.push(`Identified Risks: ${reasonOutput.data.risks.join(", ")}`);
    state.workingMemory.transientNotes.push(`Prerequisites/Dependencies: ${reasonOutput.data.dependencies.join(", ")}`);
    state.confidence.decision = Math.floor(
      (reasonOutput.data.feasibilityScore + (100 - reasonOutput.data.riskScore)) / 2
    );

    // If intent confidence is too low (< 70%), we stop and ask questions before planning
    const overallConfidence = Math.floor((state.confidence.intent + state.confidence.decision) / 2);
    if (overallConfidence < 70) {
      console.log("[CapabilityOrchestrator] Low confidence detected. Delaying planning stage for user clarification.");
      return;
    }

    // 3. Run Planning Capability
    console.log("[CapabilityOrchestrator] Executing PlanningCapability...");
    const planOutput = await this.planning.execute({
      payload: state,
    });
    console.log(
      `[CapabilityOrchestrator] Completed PlanningCapability in ${planOutput.metadata.durationMs}ms`
    );
    
    state.workingMemory.proposedTasks = planOutput.data.tasks;
    state.workingMemory.proposedSchedule = planOutput.data.schedule;
    state.workingMemory.proposedMilestones = planOutput.data.milestones;
    if (planOutput.data.explanation) {
      state.workingMemory.transientNotes.push(`Explanation: ${planOutput.data.explanation}`);
    }
    state.confidence.planning = planOutput.confidence;

    // 4. Run Negotiation Capability (with Error Isolation)
    console.log("[CapabilityOrchestrator] Executing NegotiationCapability...");
    try {
      const negotiationOutput = await this.negotiation.execute({
        payload: state,
      });
      console.log(
        `[CapabilityOrchestrator] Completed NegotiationCapability in ${negotiationOutput.metadata.durationMs}ms (Confidence: ${negotiationOutput.confidence}%)`
      );
      
      state.workingMemory.negotiationLog.push(...negotiationOutput.data.log);
      if (negotiationOutput.data.adjustedSchedule) {
        state.workingMemory.proposedSchedule = negotiationOutput.data.adjustedSchedule;
        state.workingMemory.negotiationLog.push("Schedule adjusted during negotiation.");
      }
      state.confidence.scheduling = negotiationOutput.confidence;
    } catch (negotiationError) {
      console.error(
        "[CapabilityOrchestrator] NegotiationCapability failed. Enforcing error isolation. Falling back to default planning schedule.",
        negotiationError
      );
      state.workingMemory.negotiationLog.push("Negotiation failed, fell back to unadjusted plan.");
      state.confidence.scheduling = 70; // Degraded scheduling confidence
    }
  }

  /**
   * Executes the Reflection capability DAG.
   */
  public async executeReflectionGraph(state: CognitiveState, goal: Goal): Promise<string> {
    console.log("[CapabilityOrchestrator] Executing ReflectionCapability...");
    try {
      const reflectionOutput = await this.reflection.execute({
        payload: { state, goal },
      });
      console.log(
        `[CapabilityOrchestrator] Completed ReflectionCapability in ${reflectionOutput.metadata.durationMs}ms`
      );
      console.log(`[CapabilityOrchestrator] Reflection Rationale: ${reflectionOutput.data.reflection}`);
      return reflectionOutput.data.reflection || "Goal configuration reflection complete.";
    } catch (error) {
      console.error("[CapabilityOrchestrator] ReflectionCapability failed, skipping.", error);
      return `Reflection execution failed for goal: ${goal.title}`;
    }
  }
}
