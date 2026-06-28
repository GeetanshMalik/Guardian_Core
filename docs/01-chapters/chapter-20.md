# Chapter 20

Perfect. We continue exactly according to the architecture plan.

No new chapters.
No restructuring.
No changing previous decisions.

Now we define what I personally call **the nervous system of Guardian Core**.

If the Cognitive Engine is the brain...

If Shared Memory is the long-term memory...

Then the Event System is the nervous system.

Nothing happens in Guardian Core without events flowing through the system.

---

# PART V — Software Architecture

# Chapter 20 — Event-Driven Architecture

---

# 20.1 Introduction

Guardian Core is built upon an event-driven architecture that enables loose coupling, scalability, resilience, and autonomous operation.

Rather than tightly coupling modules through direct function calls, the platform communicates primarily through immutable domain events.

Every meaningful change within Guardian Core produces an event.

These events become the source of coordination between independent capabilities, background workers, learning processes, notification systems, and external integrations.

The event-driven architecture ensures that new capabilities can be introduced without modifying existing business logic, allowing Guardian Core to evolve continuously while preserving architectural stability.

---

# 20.2 Objectives

The Event Architecture has the following objectives.

### Objective 1 — Decouple Services

Services communicate through published events instead of direct dependencies.

---

### Objective 2 — Enable Autonomous Workflows

Background workers react automatically to business events.

---

### Objective 3 — Improve Scalability

Independent consumers process events asynchronously.

---

### Objective 4 — Improve Reliability

Failures in one consumer should not affect other consumers.

---

### Objective 5 — Enable Observability

Every important state transition is recorded as an event.

---

### Objective 6 — Simplify Extensibility

New features subscribe to existing events rather than modifying existing services.

---

# 20.3 Event Philosophy

Guardian Core follows one fundamental principle.

> **Everything important that happens becomes an event.**

Examples:

* Goal Created
* Goal Updated
* Goal Completed
* Plan Generated
* Calendar Event Created
* Email Draft Generated
* Reminder Delivered
* User Accepted Recommendation
* User Rejected Recommendation
* Observation Recorded
* Learning Completed

These are not API calls.

They are business facts.

Events describe **what happened**, never **what should happen**.

---

# 20.4 High-Level Event Architecture

```text
                   Guardian Core

────────────────────────────────────────────

Planning

Learning

Memory

Decision

Research

Scheduling

Notifications

────────────────────────────────────────────
             Publish Events
────────────────────────────────────────────

                Event Bus

────────────────────────────────────────────
          Event Subscribers
────────────────────────────────────────────

Workers

Analytics

Logging

Notifications

Memory

Learning

External Sync

────────────────────────────────────────────
```

The Event Bus acts as the communication backbone of the platform.

---

# 20.5 Event Lifecycle

Every event follows the same lifecycle.

```text
Business Action

↓

Event Created

↓

Validation

↓

Published

↓

Subscribers Receive

↓

Processing

↓

New Events Generated

↓

Audit Logged

↓

Archived
```

Events are immutable after publication.

---

# 20.6 Event Categories

Guardian Core organizes events into logical domains.

### Goal Events

* GoalCreated
* GoalUpdated
* GoalArchived
* GoalCompleted
* GoalDeleted

---

### Planning Events

* PlanGenerated
* PlanUpdated
* PlanApproved
* PlanRejected
* RecoveryPlanGenerated

---

### Scheduling Events

* CalendarSynced
* CalendarConflictDetected
* EventScheduled
* EventRescheduled
* EventCancelled

---

### Communication Events

* EmailDraftCreated
* EmailApproved
* EmailSent
* MeetingAgendaGenerated

---

### Research Events

* ResearchStarted
* ResearchCompleted
* PackageUpdated
* SourceChanged

---

### Learning Events

* ObservationCaptured
* PatternDetected
* PreferenceLearned
* ConfidenceUpdated

---

### Memory Events

* MemoryCreated
* MemoryUpdated
* MemoryArchived
* MemoryRetrieved

---

### Notification Events

* ReminderScheduled
* ReminderSent
* ReminderIgnored
* DailyBriefGenerated

---

### Security Events

* UserAuthenticated
* PermissionGranted
* PermissionRevoked
* PolicyViolationDetected

---

# 20.7 Event Structure

Every event follows a common contract.

```typescript
DomainEvent {

eventId

eventType

aggregateId

aggregateType

timestamp

userId

correlationId

causationId

version

payload

metadata

}
```

Using a standardized structure simplifies logging, debugging, and replay.

---

# 20.8 Correlation & Causation

Every event includes two identifiers.

### Correlation ID

Groups all events belonging to the same user workflow.

Example:

```
Create Goal

↓

Generate Plan

↓

Schedule Calendar

↓

Generate Reminder
```

All share one Correlation ID.

---

### Causation ID

Identifies the event that directly triggered the current event.

Example:

```
GoalCreated

↓

PlanGenerated

↓

ReminderScheduled
```

ReminderScheduled references PlanGenerated as its causation.

These identifiers enable complete workflow reconstruction.

---

# 20.9 Event Bus

The Event Bus is responsible for:

* Event publishing
* Subscriber registration
* Delivery guarantees
* Retry management
* Dead-letter handling
* Event versioning

The Event Bus contains no business logic.

It only transports events.

---

# 20.10 Publishers

Every domain publishes only its own events.

Example:

Goal Service publishes:

* GoalCreated
* GoalUpdated
* GoalCompleted

Planning Engine publishes:

* PlanGenerated
* PlanUpdated

Learning Engine publishes:

* PreferenceLearned

Domains never publish events owned by another domain.

---

# 20.11 Subscribers

Multiple subscribers may react to the same event.

Example:

```
GoalCreated

↓

Planning Engine

↓

Notification Worker

↓

Analytics Service

↓

Audit Logger

↓

Research Worker
```

Each subscriber operates independently.

---

# 20.12 Event Choreography

Guardian Core primarily follows event choreography rather than centralized orchestration for asynchronous workflows.

Example:

```
GoalCreated

↓

Planning Engine

↓

PlanGenerated

↓

Scheduling Engine

↓

CalendarUpdated

↓

Notification Worker

↓

ReminderCreated

↓

ObservationCaptured

↓

Learning Engine
```

Each component reacts only to relevant events.

---

# 20.13 Event Versioning

Domain events evolve over time.

Each event includes:

* Version Number
* Schema Identifier
* Backward Compatibility Rules

Consumers should tolerate older event versions whenever possible.

---

# 20.14 Idempotency

Every subscriber must be idempotent.

Processing the same event twice should never create duplicate state.

Examples:

Creating duplicate reminders must be prevented.

Scheduling duplicate calendar events must be prevented.

Generating duplicate Gmail drafts must be prevented.

Idempotency Keys are maintained for all externally visible actions.

---

# 20.15 Retry Strategy

Retryable failures include:

* Network interruptions
* Temporary Google API failures
* Firestore transient errors
* Timeouts

Retries follow exponential backoff.

Non-retryable failures are moved to the Dead Letter Queue (DLQ) for investigation.

---

# 20.16 Dead Letter Queue (DLQ)

Events that cannot be processed after maximum retry attempts are moved to the Dead Letter Queue.

The DLQ stores:

* Event
* Failure Reason
* Retry Count
* Timestamp
* Subscriber
* Stack Trace (where applicable)

Administrators can inspect and replay DLQ events after resolving the underlying issue.

---

# 20.17 Event Replay

Because events are immutable, Guardian Core can replay historical events to:

* rebuild projections
* regenerate analytics
* restore derived state
* debug workflows
* recover from software defects

Replay operations never generate duplicate side effects.

---

# 20.18 Event Ordering

Certain events require strict ordering.

Example:

```
GoalCreated

↓

PlanGenerated

↓

PlanApproved

↓

CalendarScheduled
```

Other events, such as analytics updates, may execute in parallel.

Ordering guarantees are applied only where business consistency requires them.

---

# 20.19 Event Security

Events must never contain:

* OAuth tokens
* API keys
* passwords
* secrets
* sensitive personal information beyond what is required for processing

Sensitive payloads are referenced rather than embedded whenever practical.

---

# 20.20 Event Monitoring

Operational metrics include:

* Events published per minute
* Consumer latency
* Retry counts
* DLQ size
* Processing success rate
* Average event processing time
* Subscriber health

These metrics feed directly into Cloud Monitoring.

---

# 20.21 Design Decisions

* Use immutable domain events.
* Separate publishers from subscribers.
* Adopt standardized event contracts.
* Support replay and idempotency.
* Isolate failures using retries and DLQs.
* Preserve complete event traceability.

---

# 20.22 Architecture Decision Record (ADR-018)

### Decision

Adopt an event-driven architecture as the primary communication mechanism for asynchronous workflows.

### Context

Direct service-to-service communication creates tight coupling, limits scalability, and complicates the addition of new capabilities.

### Decision

Use immutable domain events transported through a centralized Event Bus with independent publishers and subscribers.

### Consequences

**Benefits**

* Loose coupling
* High scalability
* Easier extensibility
* Better observability
* Simplified autonomous processing

**Trade-offs**

* Increased operational complexity
* Eventual consistency
* More sophisticated debugging tools

---

# 20.23 Implementation Checklist

* [ ] Implement DomainEvent base interface.
* [ ] Build Event Bus.
* [ ] Create publisher framework.
* [ ] Implement subscriber registration.
* [ ] Add retry and DLQ support.
* [ ] Build event versioning.
* [ ] Implement idempotency protection.
* [ ] Configure event monitoring.
* [ ] Support event replay.

---

# 20.24 Chapter Summary

The Event-Driven Architecture forms the communication backbone of Guardian Core.

By representing every significant business change as an immutable domain event, transporting those events through a centralized Event Bus, and enabling independent subscribers to react asynchronously, the platform achieves loose coupling, resilience, extensibility, and autonomous behavior. Features such as correlation identifiers, event versioning, retries, dead-letter queues, idempotent processing, and replay capability ensure that the event system is suitable for production-scale operation while remaining fully aligned with the cognitive, planning, and learning architecture established in earlier chapters.

---

This chapter effectively defines the **nervous system** of Guardian Core.

The next chapter, **Chapter 21 — Background Workers**, will define the autonomous operational layer that reacts to these events. It will specify each worker (Learning Worker, Calendar Sync Worker, Notification Worker, Reflection Worker, Research Worker, Risk Assessment Worker, Memory Consolidation Worker, Daily Brief Worker, etc.), their triggers, scheduling strategies, concurrency model, failure recovery, and interaction with the Event Bus. This is where Guardian Core transitions from an interactive assistant into a continuously operating AI platform.
