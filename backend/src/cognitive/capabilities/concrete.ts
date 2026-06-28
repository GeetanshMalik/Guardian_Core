import { BaseCapability } from "./base.js";
import {
  executeUnderstandingStage,
  executeReasoningStage,
  executePlanningStage,
  executeNegotiationStage,
  executeReflectionStage
} from "../../agents.js";
import { Goal } from "../../types.js";

// 1. Understanding Capability
export interface UnderstandingInput {
  title: string;
  deadline: string;
  context: string;
}
export interface UnderstandingOutput {
  constraints: string[];
  questions: string[];
  confidenceScore: number;
}
export class UnderstandingCapability extends BaseCapability<UnderstandingInput, UnderstandingOutput> {
  getName(): string {
    return "UnderstandingCapability";
  }
  protected async performAnalysis(payload: UnderstandingInput): Promise<UnderstandingOutput> {
    return executeUnderstandingStage(payload.title, payload.deadline, payload.context);
  }
  protected async calculateConfidenceScore(output: UnderstandingOutput): Promise<number> {
    return output.confidenceScore || 90;
  }
}

// 2. Reasoning Capability
export class ReasoningCapability extends BaseCapability<any, any> {
  getName(): string {
    return "ReasoningCapability";
  }
  protected async performAnalysis(payload: any): Promise<any> {
    return executeReasoningStage(payload);
  }
}

// 3. Planning Capability
export class PlanningCapability extends BaseCapability<any, any> {
  getName(): string {
    return "PlanningCapability";
  }
  protected async performAnalysis(payload: any): Promise<any> {
    return executePlanningStage(payload);
  }
}

// 4. Negotiation Capability
export class NegotiationCapability extends BaseCapability<any, any> {
  getName(): string {
    return "NegotiationCapability";
  }
  protected async performAnalysis(payload: any): Promise<any> {
    return executeNegotiationStage(payload);
  }
  protected async calculateConfidenceScore(output: any): Promise<number> {
    return output.schedulingConfidence || 90;
  }
}

// 5. Reflection Capability
export interface ReflectionInput {
  state: any;
  goal: Goal;
}
export class ReflectionCapability extends BaseCapability<ReflectionInput, any> {
  getName(): string {
    return "ReflectionCapability";
  }
  protected async performAnalysis(payload: ReflectionInput): Promise<any> {
    return executeReflectionStage(payload.state, payload.goal);
  }
}
