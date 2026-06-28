/**
 * Infrastructure: Dependency Injection Container (§18.11)
 * 
 * Simple bootstrap container — no decorators, no reflection, no magic.
 * Wires: Repositories → Services → GuardianCore → Routes
 * 
 * Uses lazy getters so dependencies are created on first access.
 */
import type { IGuardianCore, IGoalService, INotificationService, IResearchService, ICalendarService, IAnalyticsService, IAuditService, IJobRepository, IGovernanceRepository, IMilestoneRepository, ITaskRepository, IAuditLogRepository } from "../core/interfaces.js";

// Repositories
import { goalRepository } from "./repositories/goalRepository.js";
import { memoryRepository } from "./repositories/memoryRepository.js";
import { notificationRepository } from "./repositories/notificationRepository.js";
import { toolRepository } from "./repositories/toolRepository.js";
import { researchRepository } from "./repositories/researchRepository.js";
import { jobRepository } from "./repositories/jobRepository.js";
import { governanceRepository } from "./repositories/governanceRepository.js";
import { milestoneRepository } from "./repositories/milestoneRepository.js";
import { taskRepository } from "./repositories/taskRepository.js";
import { auditLogRepository } from "./repositories/auditLogRepository.js";

// Domain Services
import { goalService } from "../domain/goals/goalService.js";
import { notificationService } from "../domain/notifications/notificationService.js";
import { researchService } from "../domain/research/researchService.js";
import { calendarService } from "../domain/calendar/calendarService.js";
import { analyticsService } from "../domain/analytics/analyticsService.js";
import { auditService } from "../domain/audit/auditService.js";

// Core
import { guardianCore } from "../core/guardianCore.js";
import { capabilityRegistry } from "../core/capabilityRegistry.js";

/**
 * Application-wide dependency container.
 * All components access dependencies through this container.
 */
export const container = {
  // ─── Repositories ───────────────────────────────────────────────────────
  get goalRepository() { return goalRepository; },
  get memoryRepository() { return memoryRepository; },
  get notificationRepository() { return notificationRepository; },
  get toolRepository() { return toolRepository; },
  get researchRepository() { return researchRepository; },
  get jobRepository(): IJobRepository { return jobRepository; },
  get governanceRepository(): IGovernanceRepository { return governanceRepository; },
  get milestoneRepository(): IMilestoneRepository { return milestoneRepository; },
  get taskRepository(): ITaskRepository { return taskRepository; },
  get auditLogRepository(): IAuditLogRepository { return auditLogRepository; },

  // ─── Domain Services ──────────────────────────────────────────────────
  get goalService(): IGoalService { return goalService; },
  get notificationService(): INotificationService { return notificationService; },
  get researchService(): IResearchService { return researchService; },
  get calendarService(): ICalendarService { return calendarService; },
  get analyticsService(): IAnalyticsService { return analyticsService; },
  get auditService(): IAuditService { return auditService; },

  // ─── Core ─────────────────────────────────────────────────────────────
  get guardianCore(): IGuardianCore { return guardianCore; },
  get capabilityRegistry() { return capabilityRegistry; },
} as const;
