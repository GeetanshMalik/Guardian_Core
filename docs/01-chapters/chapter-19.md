# Chapter 19

Perfect. We now move to one of the most important engineering chapters because it defines the **data model** that the entire platform depends on.

Up until now we've discussed *what* the system does. From this chapter onward, we define *how that information is represented*.

This chapter should be detailed enough that another engineer could build the Firestore collections, indexes, repositories, and queries without guessing.

---

# PART V — Software Architecture

# Chapter 19 — Database Architecture

---

# 19.1 Introduction

Guardian Core is fundamentally a knowledge-driven platform.

Unlike traditional productivity applications that primarily store tasks and reminders, Guardian Core maintains a persistent representation of the user's goals, decisions, memories, preferences, execution history, reflections, and learned behaviors.

The database therefore acts as the long-term knowledge store of Guardian Core rather than merely a persistence layer.

Firestore has been selected as the primary datastore because it provides:

* Horizontal scalability
* Native Google Cloud integration
* Flexible document-based storage
* Real-time synchronization
* Strong support for hierarchical data
* Serverless operations

The database is designed around domain models rather than user interface requirements.

Every collection corresponds to a business concept already defined throughout the previous chapters.

---

# 19.2 Database Design Principles

The database follows the following principles.

### Principle 1 — Domain Driven Storage

Collections represent business domains.

Not UI screens.

---

### Principle 2 — Single Source of Truth

Every entity has one authoritative location.

Example:

Preferences exist only inside the Preference collection.

They are never duplicated elsewhere.

---

### Principle 3 — Immutable History

Historical decisions, reflections and observations are never overwritten.

Instead, new versions are appended.

---

### Principle 4 — Event Traceability

Every important state transition can be reconstructed using stored events.

---

### Principle 5 — AI Ready

The schema is optimized for:

* reasoning
* retrieval
* learning
* personalization

rather than CRUD operations alone.

---

# 19.3 High-Level Database Architecture

```text
Guardian Core

↓

Repositories

↓

Firestore

────────────────────────────

Users

Goals

Goal Graphs

Milestones

Tasks

Memories

Observations

Preferences

Decisions

Reflections

Notifications

Research Packages

Calendar Metadata

Tool Integrations

Worker Jobs

Analytics

Audit Logs

────────────────────────────
```

Repositories remain the only components that communicate directly with Firestore.

---

# 19.4 Collection Overview

The platform uses the following top-level collections.

| Collection       | Purpose                                   |
| ---------------- | ----------------------------------------- |
| users            | User profile and account metadata         |
| goals            | User goals                                |
| milestones       | Goal milestones                           |
| tasks            | Generated executable tasks                |
| memories         | Shared memory objects                     |
| observations     | Raw observations collected from execution |
| preferences      | Learned user preferences                  |
| decisions        | Decision history                          |
| reflections      | Reflection records                        |
| notifications    | Notifications and reminders               |
| researchPackages | Structured research knowledge             |
| integrations     | Connected external tools                  |
| workerJobs       | Background job metadata                   |
| analytics        | Aggregated system metrics                 |
| auditLogs        | Security and execution logs               |

---

# 19.5 User Collection

The User document contains relatively static information.

Example schema:

```typescript
User {

id

name

email

photoUrl

timezone

locale

createdAt

updatedAt

subscriptionPlan

onboardingCompleted

activeIntegrations[]

settings

}
```

User documents intentionally contain very little behavioral information.

Behavior is stored separately.

---

# 19.6 Goals Collection

The Goal is the primary business entity.

Example:

```typescript
Goal {

goalId

title

description

status

priority

deadline

estimatedEffort

completionPercentage

goalGraphId

createdAt

updatedAt

ownerId

}
```

Goals remain lightweight.

Execution details are stored separately.

---

# 19.7 Goal Graph Collection

Instead of embedding complex structures inside goals,

Guardian Core stores execution graphs independently.

Example:

```text
Goal Graph

↓

Nodes

↓

Milestones

↓

Dependencies

↓

Tasks

↓

Execution State
```

This enables graph evolution without modifying Goal documents.

---

# 19.8 Milestones Collection

Each milestone belongs to one goal.

Schema:

```typescript
Milestone {

id

goalId

title

status

estimatedHours

deadline

dependencyIds[]

completionCriteria

progress

}
```

---

# 19.9 Tasks Collection

Tasks are generated dynamically.

Example:

```typescript
Task {

id

goalId

milestoneId

title

status

scheduledStart

scheduledEnd

priority

calendarEventId

toolActions[]

}
```

Tasks are disposable.

They may be regenerated during replanning.

---

# 19.10 Shared Memory Collection

Memory documents are polymorphic.

Each document includes:

```typescript
Memory {

memoryId

memoryType

entityReference

summary

embeddingReference

confidence

createdAt

updatedAt

}
```

Memory types include:

* Semantic
* Episodic
* Preference
* Reflection
* Decision

This allows a unified retrieval interface while preserving type-specific fields.

---

# 19.11 Observation Collection

Observations represent immutable facts.

Schema:

```typescript
Observation {

id

timestamp

source

goalId

eventType

payload

confidence

}
```

Observations are append-only.

They are the raw input to the Learning Engine.

---

# 19.12 Preferences Collection

Each preference stores both the current value and the evidence supporting it.

Example:

```typescript
Preference {

id

category

name

value

confidence

evidenceCount

lastUpdated

source

}
```

This structure allows preferences to evolve without losing provenance.

---

# 19.13 Decisions Collection

Every decision authorized by the Decision & Policy Engine is recorded.

Schema:

```typescript
Decision {

decisionId

goalId

selectedPlan

alternatives

confidence

approvalLevel

explanation

timestamp

}
```

Decision history enables explainability and auditing.

---

# 19.14 Reflections Collection

Reflections capture post-execution insights.

Example:

```typescript
Reflection {

reflectionId

goalId

summary

outcome

lessons

generatedAt

}
```

The Learning Engine consumes reflections asynchronously.

---

# 19.15 Research Packages Collection

Research is stored independently of goals.

Schema:

```typescript
ResearchPackage {

packageId

goalId

topics[]

sources[]

summary

recommendedReading

freshness

createdAt

}
```

This enables reuse across related goals.

---

# 19.16 Integration Collection

Stores OAuth and integration metadata.

Never stores secrets.

Example:

```typescript
Integration {

userId

provider

connected

grantedScopes[]

lastSync

syncStatus

}
```

OAuth tokens remain in secure infrastructure storage.

---

# 19.17 Worker Jobs Collection

Tracks background execution.

Schema:

```typescript
WorkerJob {

jobId

worker

status

attempts

startedAt

finishedAt

result

}
```

This collection supports retries and operational monitoring.

---

# 19.18 Audit Log Collection

Every sensitive action generates an immutable audit record.

Example:

```typescript
AuditLog {

eventId

userId

action

resource

timestamp

ipAddress

correlationId

}
```

Audit logs support compliance, debugging, and security investigations.

---

# 19.19 Collection Relationships

```text
User
 │
 ├──────────────┐
 ▼              ▼
Goals      Preferences
 │              │
 ▼              ▼
Milestones   Memories
 │              │
 ▼              ▼
Tasks      Decisions
 │              │
 └──────┬───────┘
        ▼
 Reflections
        │
        ▼
 Research Packages
```

This relational view exists conceptually, even though Firestore stores documents.

---

# 19.20 Firestore Indexing Strategy

Composite indexes should be created for common query patterns.

Examples:

Goals

* ownerId + status
* ownerId + deadline

Tasks

* goalId + status
* scheduledStart + status

Notifications

* userId + scheduledTime

Observations

* goalId + timestamp

Decisions

* userId + timestamp

Indexes should be driven by access patterns rather than convenience.

---

# 19.21 Repository Mapping

Each collection is accessed only through its repository.

Example:

```text
GoalRepository

↓

Goals Collection

PreferenceRepository

↓

Preferences Collection

MemoryRepository

↓

Memory Collection
```

No service performs raw Firestore queries.

---

# 19.22 Backup & Recovery

The persistence layer supports:

* Automated Firestore backups
* Point-in-time recovery (where available)
* Export to Cloud Storage
* Restore validation
* Disaster recovery testing

Backups must preserve both operational and historical collections.

---

# 19.23 Design Decisions

* Separate business entities into dedicated collections.
* Store execution graphs independently of goals.
* Use append-only collections for observations, decisions, and audit logs.
* Keep user profiles lightweight.
* Centralize persistence through repositories.
* Optimize indexes around real query patterns.

---

# 19.24 Architecture Decision Record (ADR-017)

### Decision

Adopt a domain-oriented Firestore schema with dedicated collections for goals, execution state, memory, learning artifacts, and audit history.

### Context

Embedding all information inside a few large documents would simplify early development but would limit scalability, complicate queries, and hinder long-term evolution.

### Decision

Represent each major domain concept as its own collection with repository-based access and explicit relationships.

### Consequences

**Benefits**

* Better scalability
* Cleaner repository design
* Improved query performance
* Easier schema evolution
* Strong support for AI retrieval workflows

**Trade-offs**

* More collections to manage
* Additional repository implementations
* Increased coordination for multi-document operations

---

# 19.25 Implementation Checklist

* [ ] Create Firestore collections.
* [ ] Define document schemas.
* [ ] Implement repositories.
* [ ] Configure composite indexes.
* [ ] Implement transactional updates where required.
* [ ] Add audit logging.
* [ ] Configure automated backups.
* [ ] Build migration/versioning strategy for schema evolution.

---

# 19.26 Chapter Summary

The Database Architecture defines Firestore as the persistent knowledge foundation of Guardian Core.

By organizing data around business domains rather than interface concerns, separating operational state from historical evidence, and centralizing persistence through repositories, the platform achieves a scalable, maintainable, and AI-friendly data model. The schema supports not only traditional CRUD operations but also the cognitive, learning, planning, and explainability capabilities defined throughout the previous chapters.

---

### Engineering observation

From this point onward, the remaining implementation chapters become even more operational:

* **Chapter 20** — Event-Driven Architecture (the internal nervous system of Guardian Core, defining every domain event, event bus, publishers, subscribers, retries, and event contracts).
* **Chapter 21** — Background Workers (autonomous jobs, scheduling, recovery workers, learning workers, notification workers, research refreshers, etc.).
* **Chapter 22** — API Design (REST/WebSocket contracts, endpoint definitions, DTOs, versioning, authentication flows, error responses, streaming interfaces, and API lifecycle).

These three chapters will complete the production backend architecture before we move on to security, observability, testing, and deployment. They will be considerably more implementation-focused and will directly inform the codebase structure you eventually build.
