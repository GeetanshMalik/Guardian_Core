/**
 * Core: Backend Interfaces (§18.15)
 * 
 * Formal interface contracts for all services, repositories, and the GuardianCore façade.
 * These interfaces define behavior — implementations remain replaceable.
 * 
 * Designed for extensibility across Chapters 19–34:
 * - Learning, memory, recovery, research, orchestration, notifications,
 *   analytics, policy enforcement, and deployment capabilities can be
 *   added without modifying existing interfaces.
 */
import type {
  Goal,
  SystemNotification,
  EpisodicMemory,
  SemanticMemory,
  PreferenceMemory,
  DecisionMemory,
  ReflectionMemory,
  Observation,
  MemoryContext,
  ToolDefinition,
  ToolExecutionLog,
  ResearchPackage,
  AutonomyLevel,
  AgentJob,
  Milestone,
  Task,
  AuditLog,
} from "../types.js";

// ─── Repository Interfaces (§18.9) ─────────────────────────────────────────

export interface IGoalRepository {
  findAll(): Promise<Goal[]>;
  findById(id: string): Promise<Goal | undefined>;
  save(goal: Goal): Promise<void>;
  delete(id: string): Promise<void>;
  // Domain queries — not just CRUD
  findByStatus(status: Goal["status"]): Promise<Goal[]>;
  findGoalsAtRisk(): Promise<Goal[]>;
  findGoalsDueSoon(withinDays: number): Promise<Goal[]>;
  findGoalsNeedingRecovery(): Promise<Goal[]>;
}

export interface IMemoryRepository {
  getEpisodicMemories(): Promise<EpisodicMemory[]>;
  getSemanticMemories(): Promise<SemanticMemory[]>;
  getPreferenceMemories(): Promise<PreferenceMemory[]>;
  getDecisionMemories(): Promise<DecisionMemory[]>;
  getReflectionMemories(): Promise<ReflectionMemory[]>;
  savePreferenceMemory(pref: PreferenceMemory): Promise<void>;
  saveSemanticMemory(fact: SemanticMemory): Promise<void>;
  deleteMemory(layer: string, id: string): Promise<void>;
  resetAll(): Promise<void>;
  getObservations(): Promise<Observation[]>;
  deleteObservation(id: string): Promise<void>;
}

export interface INotificationRepository {
  findAll(): Promise<SystemNotification[]>;
  save(notification: SystemNotification): Promise<void>;
  markRead(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface IToolRepository {
  getRegistry(): Promise<ToolDefinition[]>;
  saveTool(tool: ToolDefinition): Promise<void>;
  getLogs(): Promise<ToolExecutionLog[]>;
}

export interface IResearchRepository {
  findByGoalId(goalId: string): Promise<ResearchPackage[]>;
  findAll(): Promise<ResearchPackage[]>;
  save(pkg: ResearchPackage): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IJobRepository {
  findAll(): Promise<AgentJob[]>;
  save(job: AgentJob): Promise<void>;
}

export interface IGovernanceRepository {
  getAutonomyLevel(): Promise<AutonomyLevel>;
  saveAutonomyLevel(level: AutonomyLevel): Promise<void>;
}

export interface IMilestoneRepository {
  findAll(): Promise<Milestone[]>;
  findById(id: string): Promise<Milestone | undefined>;
  findByGoalId(goalId: string): Promise<Milestone[]>;
  save(milestone: Milestone): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ITaskRepository {
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | undefined>;
  findByGoalId(goalId: string): Promise<Task[]>;
  save(task: Task): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IAuditLogRepository {
  findAll(): Promise<AuditLog[]>;
  save(log: AuditLog): Promise<void>;
}

// ─── Domain Service Interfaces (§18.8) ──────────────────────────────────────

export interface IGoalService {
  getAll(): Promise<Goal[]>;
  getById(id: string): Promise<Goal | undefined>;
  create(goal: Goal): Promise<Goal>;
  update(goal: Goal, changedFields?: string[]): Promise<Goal>;
  delete(id: string): Promise<void>;
}

export interface ICalendarService {
  syncGoalSessions(goal: Goal, sessionIds: string[], accessToken?: string): Promise<Goal>;
}

export interface IResearchService {
  getPackagesByGoalId(goalId: string): Promise<ResearchPackage[]>;
  triggerResearch(goalId: string, topic: string, context: string): Promise<ResearchPackage>;
  deletePackage(id: string): Promise<void>;
}

export interface INotificationService {
  getAll(): Promise<SystemNotification[]>;
  markRead(id: string): Promise<void>;
  clearAll(): Promise<void>;
  push(notification: SystemNotification): Promise<void>;
  registerEventListeners(): void;
}

export interface IAnalyticsService {
  getGoalAnalytics(): Promise<any>;
  getProductivityMetrics(): any;
  registerEventListeners(): void;
}

export interface IAuditService {
  log(action: string, resource: string, details?: Record<string, any>, ipAddress?: string, userId?: string): Promise<void>;
  getAll(): Promise<AuditLog[]>;
  registerEventListeners(): void;
}

// ─── GuardianCore Façade Interface (§18.7) ──────────────────────────────────
// Uses Coordinator pattern to prevent God Object.
// Each coordinator owns one capability domain.

export interface IGuardianCore {
  /** Goal lifecycle — delegates to GoalCoordinator */
  createGoal(title: string, deadline: string, context: string): Promise<Goal>;
  updateGoal(goal: Goal, changedFields?: string[]): Promise<Goal>;
  deleteGoal(id: string): Promise<void>;

  /** Conversation — delegates to ConversationCoordinator */
  processConversation(goalId: string, message: string): Promise<{ responseMessage: string; goal: Goal | null }>;

  /** Planning — delegates to PlanningCoordinator */
  generatePlan(goalId: string, answers?: Record<string, string>): Promise<Goal>;
  forcePlan(goalId: string): Promise<Goal>;

  /** Execution — delegates to ExecutionCoordinator */
  executeTask(goalId: string, taskId: string, userPrompt: string): Promise<Goal>;
  completeTask(goalId: string, taskId: string, isCompleted: boolean): Promise<Goal>;

  /** Recovery — delegates to RecoveryCoordinator */
  evaluateRecovery(goalId: string): Promise<Goal>;
  applyRecovery(goalId: string): Promise<Goal>;

  /** Research — delegates to ResearchCoordinator */
  triggerResearch(goalId: string): Promise<ResearchPackage>;

  /** Calendar — delegates to CalendarCoordinator */
  syncCalendar(goalId: string, sessionIds: string[], accessToken?: string): Promise<Goal>;
}

// ─── Capability Registry Interface (§18.7 extension) ────────────────────────
// Allows capabilities to be registered dynamically for future chapters.

export interface ICapability {
  name: string;
  description: string;
  execute(context: CapabilityContext, ...args: any[]): Promise<any>;
}

export interface CapabilityContext {
  goalId?: string;
  userId?: string;
  memoryContext?: MemoryContext;
  requestId?: string;
  correlationId?: string;
}

export interface ICapabilityRegistry {
  register(capability: ICapability): void;
  get(name: string): ICapability | undefined;
  getAll(): ICapability[];
  has(name: string): boolean;
  getConnectedTools(): Promise<any[]>;
  canPerform(toolId: string, operation: string): Promise<boolean>;
  getCapabilityReport(): Promise<string>;
}

export interface IContextEvaluator {
  evaluate(title: string, deadline: string, context: string): Promise<any>;
}

export interface IToolAwareness {
  getConnectedTools(): Promise<any[]>;
  canPerform(toolId: string, operation: string): Promise<boolean>;
  getCapabilityReport(): Promise<string>;
}

// ─── Worker Interface (§18.12) ──────────────────────────────────────────────
// Interfaces only — don't split workers until Ch22-23.

export interface IWorker {
  name: string;
  intervalMs: number;
  execute(): Promise<void>;
}

