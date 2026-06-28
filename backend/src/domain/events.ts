/**
 * Domain Event Bus — Typed, categorized, in-process event emitter (§17.4, §17.8, §18.10, §20)
 * 
 * Events are organized by domain category:
 * - Goal Events: GoalCreated, GoalUpdated, GoalCompleted, GoalDeleted
 * - Planning Events: PlanningRequested, PlanGenerated
 * - Recovery Events: RecoveryTriggered, RecoveryCompleted
 * - Learning Events: ObservationCreated, ReflectionGenerated, LearningCompleted
 * - Research Events: ResearchCompleted
 * - Calendar Events: CalendarSynced
 * - Notification Events: NotificationRequested, ReminderScheduled
 * - Memory Events: MemoryConsolidated
 * - Decision Events: DecisionMade
 * 
 * Includes reliability upgrades: correlation tracing, subscriber retries, DLQ, and Event Store.
 */
import crypto from "node:crypto";
import type { Goal, ResearchPackage, SystemNotification } from "../types.js";
import { runWithRequestContext, getRequestContext } from "../infrastructure/requestContext.js";
import {
  saveEventStoreEntry,
  getProcessedEvents,
  saveProcessedEvent,
  saveDeadLetterEvent,
  getEventStore
} from "../db.js";

// ─── Base Event Contract ───────────────────────────────────────────────────

export interface BaseEvent {
  eventId?: string; // Generated on emission if not present
  type: string;     // Discriminant (event name)
  timestamp: string;
  userId?: string;  // Extracted from RequestContext if not present
  correlationId?: string; // Extracted from RequestContext or generated
  causationId?: string;
  version?: number;
  metadata?: {
    isReplay?: boolean;
    [key: string]: any;
  };
}

// ─── Goal Events ────────────────────────────────────────────────────────────

export interface GoalCreatedEvent extends BaseEvent {
  type: "GoalCreated";
  goal: Goal;
}

export interface GoalUpdatedEvent extends BaseEvent {
  type: "GoalUpdated";
  goal: Goal;
  changedFields: string[];
}

export interface GoalCompletedEvent extends BaseEvent {
  type: "GoalCompleted";
  goal: Goal;
}

export interface GoalDeletedEvent extends BaseEvent {
  type: "GoalDeleted";
  goalId: string;
}

// ─── Planning Events ────────────────────────────────────────────────────────

export interface PlanningRequestedEvent extends BaseEvent {
  type: "PlanningRequested";
  goalId: string;
}

export interface PlanGeneratedEvent extends BaseEvent {
  type: "PlanGenerated";
  goalId: string;
  taskCount: number;
  milestoneCount: number;
}

// ─── Recovery Events ────────────────────────────────────────────────────────

export interface RecoveryTriggeredEvent extends BaseEvent {
  type: "RecoveryTriggered";
  goalId: string;
  riskLevel: string;
}

export interface RecoveryCompletedEvent extends BaseEvent {
  type: "RecoveryCompleted";
  goalId: string;
}

// ─── Learning Events ────────────────────────────────────────────────────────

export interface ObservationCreatedEvent extends BaseEvent {
  type: "ObservationCreated";
  capability: string;
  goalId?: string;
}

export interface ReflectionGeneratedEvent extends BaseEvent {
  type: "ReflectionGenerated";
  insight: string;
  goalId?: string;
}

export interface LearningCompletedEvent extends BaseEvent {
  type: "LearningCompleted";
  patternCount: number;
}

// ─── Research Events ────────────────────────────────────────────────────────

export interface ResearchCompletedEvent extends BaseEvent {
  type: "ResearchCompleted";
  researchPackage: ResearchPackage;
  goalId: string;
}

// ─── Calendar Events ────────────────────────────────────────────────────────

export interface CalendarSyncedEvent extends BaseEvent {
  type: "CalendarSynced";
  goalId: string;
  sessionCount: number;
}

// ─── Notification Events ────────────────────────────────────────────────────

export interface NotificationRequestedEvent extends BaseEvent {
  type: "NotificationRequested";
  notification: SystemNotification;
}

export interface ReminderScheduledEvent extends BaseEvent {
  type: "ReminderScheduled";
  goalId: string;
  reminderTime: string;
}

// ─── Memory Events ──────────────────────────────────────────────────────────

export interface MemoryConsolidatedEvent extends BaseEvent {
  type: "MemoryConsolidated";
  memoryType: string;
  recordCount: number;
}

// ─── Decision Events ────────────────────────────────────────────────────────

export interface DecisionMadeEvent extends BaseEvent {
  type: "DecisionMade";
  decisionId: string;
  goalId: string;
  outcome: string;
}

// ─── Worker / Autonomous Agent Events ───────────────────────────────────────

export interface DailyBriefGeneratedEvent extends BaseEvent {
  type: "DailyBriefGenerated";
  briefText: string;
}

export interface DeadlineRiskDetectedEvent extends BaseEvent {
  type: "DeadlineRiskDetected";
  goalId: string;
  riskLevel: string;
}

export interface CalendarSynchronizedEvent extends BaseEvent {
  type: "CalendarSynchronized";
  goalId: string;
  syncedEventsCount: number;
}

export interface PreferenceLearnedEvent extends BaseEvent {
  type: "PreferenceLearned";
  preferenceKey: string;
  value: string;
}

export interface ReflectionCreatedEvent extends BaseEvent {
  type: "ReflectionCreated";
  goalId: string;
  insight: string;
}

export interface ResearchPackageUpdatedEvent extends BaseEvent {
  type: "ResearchPackageUpdated";
  goalId: string;
  topic: string;
}

export interface NotificationDeliveredEvent extends BaseEvent {
  type: "NotificationDelivered";
  notificationId: string;
  recipient: string;
}

export interface RiskAssessmentCompletedEvent extends BaseEvent {
  type: "RiskAssessmentCompleted";
  goalId: string;
  riskScore: number;
}

export interface AnalyticsUpdatedEvent extends BaseEvent {
  type: "AnalyticsUpdated";
  metrics: Record<string, any>;
}

// ─── Behavioral Learning Events ─────────────────────────────────────────────

export interface TaskPostponedEvent extends BaseEvent {
  type: "TaskPostponed";
  goalId: string;
  taskId: string;
  originalDate: string;
  newDate: string;
}

export interface TaskRescheduledEvent extends BaseEvent {
  type: "TaskRescheduled";
  goalId: string;
  taskId: string;
  fromTime: string;
  toTime: string;
}

export interface ReminderIgnoredEvent extends BaseEvent {
  type: "ReminderIgnored";
  goalId: string;
  reminderId: string;
  scheduledTime: string;
}

// ─── Union Type ─────────────────────────────────────────────────────────────

export type DomainEvent =
  | GoalCreatedEvent
  | GoalUpdatedEvent
  | GoalCompletedEvent
  | GoalDeletedEvent
  | PlanningRequestedEvent
  | PlanGeneratedEvent
  | RecoveryTriggeredEvent
  | RecoveryCompletedEvent
  | ObservationCreatedEvent
  | ReflectionGeneratedEvent
  | LearningCompletedEvent
  | ResearchCompletedEvent
  | CalendarSyncedEvent
  | NotificationRequestedEvent
  | ReminderScheduledEvent
  | MemoryConsolidatedEvent
  | DecisionMadeEvent
  | DailyBriefGeneratedEvent
  | DeadlineRiskDetectedEvent
  | CalendarSynchronizedEvent
  | PreferenceLearnedEvent
  | ReflectionCreatedEvent
  | ResearchPackageUpdatedEvent
  | NotificationDeliveredEvent
  | RiskAssessmentCompletedEvent
  | AnalyticsUpdatedEvent
  | TaskPostponedEvent
  | TaskRescheduledEvent
  | ReminderIgnoredEvent;

type EventMap = {
  GoalCreated: GoalCreatedEvent;
  GoalUpdated: GoalUpdatedEvent;
  GoalCompleted: GoalCompletedEvent;
  GoalDeleted: GoalDeletedEvent;
  PlanningRequested: PlanningRequestedEvent;
  PlanGenerated: PlanGeneratedEvent;
  RecoveryTriggered: RecoveryTriggeredEvent;
  RecoveryCompleted: RecoveryCompletedEvent;
  ObservationCreated: ObservationCreatedEvent;
  ReflectionGenerated: ReflectionGeneratedEvent;
  LearningCompleted: LearningCompletedEvent;
  ResearchCompleted: ResearchCompletedEvent;
  CalendarSynced: CalendarSyncedEvent;
  NotificationRequested: NotificationRequestedEvent;
  ReminderScheduled: ReminderScheduledEvent;
  MemoryConsolidated: MemoryConsolidatedEvent;
  DecisionMade: DecisionMadeEvent;
  DailyBriefGenerated: DailyBriefGeneratedEvent;
  DeadlineRiskDetected: DeadlineRiskDetectedEvent;
  CalendarSynchronized: CalendarSynchronizedEvent;
  PreferenceLearned: PreferenceLearnedEvent;
  ReflectionCreated: ReflectionCreatedEvent;
  ResearchPackageUpdated: ResearchPackageUpdatedEvent;
  NotificationDelivered: NotificationDeliveredEvent;
  RiskAssessmentCompleted: RiskAssessmentCompletedEvent;
  AnalyticsUpdated: AnalyticsUpdatedEvent;
  TaskPostponed: TaskPostponedEvent;
  TaskRescheduled: TaskRescheduledEvent;
  ReminderIgnored: ReminderIgnoredEvent;
};

interface Subscriber {
  subscriberName: string;
  handler: (event: any) => void | Promise<void>;
}

// ─── DomainEventBus ─────────────────────────────────────────────────────────

class DomainEventBus {
  private subscribers: Map<string, Subscriber[]> = new Map();

  /** Emit a typed domain event asynchronously with retries, DLQ, and store archiving. */
  emit<K extends keyof EventMap>(event: EventMap[K]): void {
    const ctx = getRequestContext();
    event.eventId = event.eventId || crypto.randomUUID();
    event.timestamp = event.timestamp || new Date().toISOString();
    event.correlationId = event.correlationId || ctx?.correlationId || crypto.randomUUID();
    event.userId = event.userId || ctx?.userId || "anonymous";
    event.version = event.version || 1;
    event.metadata = event.metadata || {};

    console.log(`[DomainEventBus] Event emitted: ${event.type} (ID: ${event.eventId}, Correlation ID: ${event.correlationId})`);

    // 1. Archival (Event Store) - only for live publications
    if (!event.metadata.isReplay) {
      saveEventStoreEntry({
        id: event.eventId,
        eventType: event.type,
        timestamp: event.timestamp,
        userId: event.userId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        version: event.version,
        payload: { ...event, eventId: undefined, correlationId: undefined, userId: undefined, version: undefined, metadata: undefined },
        metadata: event.metadata
      }).catch(err => console.error(`[DomainEventBus] Failed to archive event ${event.eventId}:`, err));
    }

    // 2. Dispatch to registered subscribers asynchronously in request context
    const subs = this.subscribers.get(event.type) || [];
    for (const sub of subs) {
      runWithRequestContext(
        {
          correlationId: event.correlationId,
          userId: event.userId,
          startTime: Date.now()
        },
        () => {
          this.executeSubscriberWithRetryAndIdempotency(sub, event).catch(err => {
            console.error(`[DomainEventBus] Error dispatching event ${event.eventId} to subscriber ${sub.subscriberName}:`, err);
          });
        }
      );
    }
  }

  /** Register a subscriber with a unique name and handler. */
  on<K extends keyof EventMap>(
    eventName: K,
    subscriberName: string,
    handler: (event: EventMap[K]) => void | Promise<void>
  ): void {
    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, []);
    }
    this.subscribers.get(eventName)!.push({ subscriberName, handler });
    console.log(`[DomainEventBus] Registered subscriber "${subscriberName}" for event type "${eventName}"`);
  }

  /** Execute a subscriber handler with retry policy and idempotency tracking. */
  private async executeSubscriberWithRetryAndIdempotency(
    sub: Subscriber,
    event: any
  ): Promise<void> {
    const idempotencyKey = `${sub.subscriberName}:${event.eventId}`;

    try {
      // Idempotency check: Skip if already processed successfully by this subscriber
      const processed = await getProcessedEvents();
      if (processed.some(p => p.id === idempotencyKey)) {
        console.log(`[DomainEventBus] Event ${event.eventId} already processed by ${sub.subscriberName}. Skipping.`);
        return;
      }

      const maxAttempts = 3;
      const initialDelay = 100; // ms
      let attempt = 0;
      let lastError: any = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          await sub.handler(event);

          // Mark as processed upon success
          await saveProcessedEvent({
            id: idempotencyKey,
            subscriberName: sub.subscriberName,
            eventId: event.eventId,
            timestamp: new Date().toISOString()
          });

          console.log(`[DomainEventBus] Subscriber ${sub.subscriberName} processed event ${event.eventId} successfully on attempt ${attempt}`);
          return;
        } catch (err: any) {
          lastError = err;
          console.warn(`[DomainEventBus] Subscriber ${sub.subscriberName} failed attempt ${attempt} for event ${event.eventId}. Error: ${err.message}`);

          if (attempt < maxAttempts) {
            const delay = initialDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // If all attempts failed, send event to Dead Letter Queue (DLQ)
      console.error(`[DomainEventBus] Subscriber ${sub.subscriberName} failed all ${maxAttempts} attempts for event ${event.eventId}. Routing to DLQ.`);
      await saveDeadLetterEvent({
        id: crypto.randomUUID(),
        eventId: event.eventId,
        eventType: event.type,
        subscriberName: sub.subscriberName,
        eventPayload: event,
        error: {
          message: lastError?.message || "Unknown error occurred",
          stack: lastError?.stack
        },
        timestamp: new Date().toISOString(),
        attempts: maxAttempts
      });

    } catch (err) {
      console.error(`[DomainEventBus] Fatal error processing event ${event.eventId} in subscriber ${sub.subscriberName}:`, err);
    }
  }

  /** Replay a specific event payload to a target subscriber (bypassing idempotency registry). */
  async replayEvent(eventPayload: any, subscriberName: string): Promise<void> {
    const list = this.subscribers.get(eventPayload.type) || [];
    const sub = list.find(s => s.subscriberName === subscriberName);
    if (!sub) {
      throw new Error(`Subscriber "${subscriberName}" not registered for event type "${eventPayload.type}"`);
    }

    const replayedEvent = {
      ...eventPayload,
      metadata: {
        ...(eventPayload.metadata || {}),
        isReplay: true
      }
    };

    console.log(`[DomainEventBus] Replaying event ${eventPayload.eventId} (${eventPayload.type}) to subscriber "${subscriberName}"`);

    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          correlationId: replayedEvent.correlationId,
          userId: replayedEvent.userId,
          startTime: Date.now()
        },
        async () => {
          try {
            await sub.handler(replayedEvent);

            // Record successful execution of replay under idempotency log
            await saveProcessedEvent({
              id: `${subscriberName}:${replayedEvent.eventId}`,
              subscriberName: subscriberName,
              eventId: replayedEvent.eventId,
              timestamp: new Date().toISOString()
            });

            resolve();
          } catch (err) {
            reject(err);
          }
        }
      );
    });
  }

  /** Replays multiple events matching a correlationId or timestamp range. */
  async replayRangeOrCorrelationId(query: { correlationId?: string; startTime?: string; endTime?: string }): Promise<number> {
    const allEvents = await getEventStore();
    let filtered = allEvents;

    if (query.correlationId) {
      filtered = filtered.filter(e => e.correlationId === query.correlationId);
    }
    if (query.startTime) {
      const start = new Date(query.startTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (query.endTime) {
      const end = new Date(query.endTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    console.log(`[DomainEventBus] Found ${filtered.length} events for replay matching query:`, query);

    let dispatchCount = 0;
    for (const entry of filtered) {
      const event = {
        ...entry.payload,
        eventId: entry.id,
        type: entry.eventType,
        timestamp: entry.timestamp,
        userId: entry.userId,
        correlationId: entry.correlationId,
        causationId: entry.id,
        metadata: {
          ...(entry.metadata || {}),
          isReplay: true
        }
      };

      const subs = this.subscribers.get(entry.eventType) || [];
      for (const sub of subs) {
        this.replayEvent(event, sub.subscriberName).catch(err => {
          console.error(`[DomainEventBus] Replay of event ${event.eventId} to subscriber "${sub.subscriberName}" failed:`, err);
        });
        dispatchCount++;
      }
    }
    return dispatchCount;
  }

  /** Remove all listeners/subscribers (useful for testing). */
  removeAllListeners(): void {
    this.subscribers.clear();
  }
}

/** Singleton event bus — shared across all domain services. */
export const domainEventBus = new DomainEventBus();
