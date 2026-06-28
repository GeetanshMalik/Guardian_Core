import { Goal, MemoryContext } from "../types.js";

export interface ConfidenceMatrix {
  intent: number;       // Confidence in understanding user intent (0-100)
  planning: number;     // Confidence in task breakdown & timelines (0-100)
  scheduling: number;   // Confidence in time slot allocations (0-100)
  decision: number;     // Overall engine confidence to proceed (0-100)
}

export interface WorkingMemory {
  transientNotes: string[];
  proposedTasks?: any[];
  proposedSchedule?: any[];
  proposedMilestones?: any[];
  clarificationQuestions?: string[];
  negotiationLog: string[];
  decisionsMade: string[];
}

export interface LongTermMemory {
  preferences: {
    workHoursStart: string; // e.g. "09:00"
    workHoursEnd: string;   // e.g. "22:00"
    preferredSessionMinutes: number;
    avoidMornings: boolean;
    avoidWeekends: boolean;
    avoidEvenings?: boolean;
    estimateAdjustmentFactor?: number;
  };
  habits: {
    averageCompletionRate: number;
    procrastinationScore: number;
  };
}

export interface WorldModelSnapshot {
  timestamp: string;
  activeGoals: Goal[];
  upcomingDeadlines: { goalId: string; title: string; date: string }[];
  userPreferences: LongTermMemory["preferences"];
}

export interface CognitiveState {
  goalId?: string;
  goalTitle?: string;
  goalDeadline?: string;
  goalContext?: string;
  deadlineFormatted?: string;
  currentStage: "PERCEIVE" | "EVALUATE_CONTEXT" | "UNDERSTAND" | "REASON" | "PLAN" | "NEGOTIATE" | "DECIDE" | "EXECUTE" | "REFLECT" | "LEARN";
  history: { stage: string; timestamp: string; details: string }[];
  worldModel: WorldModelSnapshot;
  workingMemory: WorkingMemory;
  confidence: ConfidenceMatrix;
  memoryContext?: MemoryContext;
}

