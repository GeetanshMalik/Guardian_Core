export interface Task {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  dayNumber: number;
  isCompleted: boolean;
  completedAt: string | null;
  aiAssistance: {
    generatedAt: string;
    assetType: string;
    content: string;
  } | null;
  priority?: "Low" | "Medium" | "High";
  relatedMilestoneId?: string | null;
  requiredTools?: string[];
  requiredResources?: string[];
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  dependencies: string[]; // Milestone IDs that this milestone depends on
  targetDate: string; // YYYY-MM-DD
  completionCriteria: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  riskLevel: "Low" | "Medium" | "High";
}

export interface CalendarSession {
  id: string;
  taskId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isSynced: boolean;
}

export interface RecoveryPlan {
  summary: string;
  actions: string[];
  revisedTasks: {
    taskId: string;
    revisedEstimate: number;
    action: string;
  }[];
}

export interface Goal {
  id: string;
  title: string;
  deadline: string;
  context: string;
  createdAt: string;
  status: 'active' | 'completed' | 'failed';
  
  analysis?: {
    deadlineFormatted: string;
    constraints: string[];
    feasibilityScore: number;
    riskScore: number;
    complexity: 'Low' | 'Medium' | 'High';
    risks: string[];
    dependencies: string[];
    explanation?: string;
  };

  clarification?: {
    questions: string[];
    answers: { [question: string]: string };
  };

  plan?: {
    tasks: Task[];
    schedule: CalendarSession[];
    milestones?: Milestone[];
  };

  progress?: {
    currentRiskLevel: 'Low' | 'Medium' | 'High';
    procrastinationIndicator: number; // 0 to 100
    riskExplanations: string[];
    recoveryPlan: RecoveryPlan | null;
  };
}

export interface EpisodicMemory {
  id: string;
  timestamp: string;
  participants: string[];
  outcome: string;
  relatedGoals: string[];
  lessonsLearned: string[];
}

export interface SemanticMemory {
  id: string;
  fact: string;
  category: string; // e.g. "education", "work", "preferences", "calendar"
  lastUpdated: string;
}

export interface PreferenceMemory {
  id: string;
  preferenceKey: string; // e.g. "preferredStudyWindow", "avoidWeekends", "avoidMornings", "workHoursStart", "workHoursEnd"
  value: string;
  confidence: number; // 0-100
  evidenceCount: number;
  source: string;
  lastUpdated: string;
  version: number;
  status: "hypothesis" | "promoted";
}

export interface Observation {
  id: string;
  timestamp: string;
  capability: string; // e.g. "PlanningCapability", "NegotiationCapability"
  goalId?: string;
  action: string;     // e.g. "manual_calendar_shift", "milestone_completed", "goal_created"
  outcome: string;    // description of outcome
  evidence: string;   // detailed evidence
  source: string;     // "User", "System", "AgentWorker"
  confidence: number; // 0-100
  userFeedback?: "none" | "up" | "down";
  contextSnapshot?: string;
}

export interface DecisionMemory {
  id: string;
  decisionId: string;
  context: string;
  alternativesConsidered: string[];
  selectedOutcome: string;
  supportingEvidence: string[];
  confidence: number;
  userOverrideStatus: "none" | "overridden" | "confirmed";
  timestamp: string;
}

export interface ReflectionMemory {
  id: string;
  insight: string;
  sourceGoalId?: string;
  timestamp: string;
  category: string;
}

export interface MemoryContext {
  preferences: PreferenceMemory[];
  semanticFacts: SemanticMemory[];
  recentEpisodes: EpisodicMemory[];
  historicalDecisions: DecisionMemory[];
  activeReflections: ReflectionMemory[];
}

export interface PolicyCheck {
  policyName: string;
  passed: boolean;
  reason?: string;
}

export interface PolicyDecision {
  id: string;
  decisionType: string;
  selectedRecommendation: any;
  supportingEvidence: string[];
  confidence: number;
  policiesApplied: PolicyCheck[];
  requiredApproval: boolean;
  executionStatus: "authorized" | "blocked" | "pending_approval";
  explanation: string;
}

export type AutonomyLevel = "advisory" | "assisted" | "delegated" | "trusted_automation";

export interface ToolDefinition {
  id: string;
  name: string;
  operations: string[];
  requiredScopes: string[];
  availabilityStatus: "active" | "inactive";
  healthStatus: "healthy" | "degraded" | "offline";
  retryPolicy: {
    maxRetries: number;
    initialDelayMs: number;
  };
  timeoutMs: number;
  rollbackSupported: boolean;
}

export interface ToolExecutionRequest {
  toolId: string;
  operation: string;
  parameters: any;
  decisionId: string;
  userId: string;
  correlationId: string;
  requiredPermission: string;
  expectedOutcome?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  operationId: string;
  timestamp: string;
  modifiedResources: {
    resourceType: string;
    resourceId: string;
    previousState?: any;
    newState?: any;
  }[];
  validationResult?: {
    passed: boolean;
    reason?: string;
  };
  rollbackInfo?: {
    rollbackSupported: boolean;
    rollbackPayload?: any;
  };
  metadata: {
    durationMs: number;
    attempts: number;
    error?: string;
  };
}

export interface ToolExecutionLog {
  id: string;
  request: ToolExecutionRequest;
  result: ToolExecutionResult;
  timestamp: string;
  status: "success" | "failed" | "rolled_back";
  rolledBackAt?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  category: "documentation" | "tutorial" | "academic" | "blog" | "general";
  authorityScore: number; // 0-100
  recencyDate?: string;
}

export interface ResearchConcept {
  concept: string;
  definition: string;
  importance: string;
}

export interface ResearchPackage {
  id: string;
  goalId: string;
  topic: string;
  subtopics: string[];
  sources: ResearchSource[];
  summaries: string[];
  concepts: ResearchConcept[];
  readingRoadmap: string[];
  actionItems: string[];
  freshnessStatus: "fresh" | "stale";
  createdAt: string;
  lastUpdated: string;
}




