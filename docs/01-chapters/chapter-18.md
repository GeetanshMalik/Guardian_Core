# Chapter 18

Excellent. This is where the document starts becoming an **actual engineering blueprint** instead of a software design document.

From now on, every chapter should be detailed enough that a senior engineer can begin implementation without guessing.

No more conceptual-only discussions.

We'll include:

* Production folder structures
* Interfaces
* Service responsibilities
* Communication diagrams
* API flow
* Sequence diagrams
* Firestore mapping
* Class diagrams (text)
* Error handling
* Design patterns
* Extension points

This is exactly what a Staff Engineer would write before a team starts implementation.

---

# PART V — Software Architecture

# Chapter 18 — Backend Architecture

---

# 18.1 Introduction

Guardian Core is implemented as a modular, service-oriented backend that separates business intelligence from infrastructure concerns.

Unlike traditional REST backends where controllers directly manipulate databases, Guardian Core follows a layered architecture in which every request flows through cognitive reasoning, orchestration, policy validation, and execution before interacting with external services.

The backend is designed to satisfy the following non-functional requirements:

* High cohesion
* Low coupling
* Horizontal scalability
* Fault isolation
* Testability
* Event-driven communication
* Cloud-native deployment
* AI-model independence

The backend should remain maintainable as new AI capabilities, external integrations, and autonomous workflows are introduced.

---

# 18.2 Backend Design Principles

The backend follows these principles.

### Single Responsibility

Every service owns one business capability.

Example:

Goal Service manages goals.

Memory Service manages memories.

Notification Service manages notifications.

No service performs unrelated responsibilities.

---

### Dependency Inversion

Business logic never depends directly on:

* Firestore
* Gemini
* Google APIs
* Cloud Run

Infrastructure depends on the domain.

---

### Event First

Whenever possible,

modules communicate using events instead of direct method calls.

---

### AI Independence

No controller or service communicates directly with Gemini.

Only Guardian Core owns reasoning.

This allows the reasoning model to be replaced without affecting backend logic.

---

# 18.3 Proposed Backend Folder Structure

```text
backend/

├── src/

│
├── app/
│   ├── server.ts
│   ├── routes.ts
│   ├── middleware.ts
│   └── dependency-container.ts
│
├── core/
│   ├── guardian-core.ts
│   ├── cognitive-engine/
│   ├── orchestration/
│   ├── planning/
│   ├── learning/
│   ├── decision/
│   ├── memory/
│   ├── execution/
│   └── world-state/
│
├── domains/
│   ├── goal/
│   ├── calendar/
│   ├── communication/
│   ├── research/
│   ├── notification/
│   ├── analytics/
│   └── integration/
│
├── adapters/
│   ├── gemini/
│   ├── gmail/
│   ├── calendar/
│   ├── drive/
│   ├── firestore/
│   └── oauth/
│
├── workers/
│   ├── reminder.worker.ts
│   ├── learning.worker.ts
│   ├── reflection.worker.ts
│   ├── research.worker.ts
│   ├── calendar.worker.ts
│   ├── notification.worker.ts
│   └── consolidation.worker.ts
│
├── events/
│   ├── publishers/
│   ├── subscribers/
│   └── event-bus.ts
│
├── shared/
│   ├── logger/
│   ├── config/
│   ├── utils/
│   ├── errors/
│   ├── constants/
│   └── types/
│
├── api/
│   ├── controllers/
│   ├── routes/
│   ├── validators/
│   └── dto/
│
├── infrastructure/
│   ├── firestore/
│   ├── cache/
│   ├── monitoring/
│   ├── secrets/
│   └── scheduler/
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

This structure follows Domain-Driven Design while maintaining a clear separation between domain logic, infrastructure, adapters, and application services.

---

# 18.4 Layered Backend Architecture

The backend is divided into seven logical layers.

```text
Presentation Layer

↓

API Layer

↓

Guardian Core

↓

Domain Services

↓

Integration Layer

↓

Infrastructure Layer

↓

Persistence Layer
```

Each layer communicates only with the layer directly below it.

Cross-layer shortcuts are prohibited.

---

# 18.5 Request Processing Pipeline

Every incoming request follows the same processing path.

```text
Client

↓

API Route

↓

Authentication Middleware

↓

Validation Middleware

↓

Controller

↓

Guardian Core

↓

Capability Orchestrator

↓

Decision Engine

↓

Execution Framework

↓

Domain Service

↓

Repository

↓

Firestore
```

Every request follows the same architecture.

There are no exceptions.

---

# 18.6 API Layer

The API layer exposes HTTP and WebSocket endpoints.

Responsibilities include:

* Request validation
* Authentication
* Authorization
* DTO transformation
* Error translation
* Response formatting

The API layer contains **no business logic**.

Controllers should be thin.

Example:

```typescript
POST /goals

↓

GoalController

↓

GuardianCore.createGoal()

↓

Return Response
```

---

# 18.7 Guardian Core Module

Guardian Core acts as the application's intelligence façade.

Example interface:

```typescript
interface GuardianCore {

createGoal()

updateGoal()

processConversation()

generateDailyBrief()

executeRecovery()

triggerLearning()

performResearch()

}
```

Controllers never call individual services directly.

Everything enters through Guardian Core.

---

# 18.8 Domain Services

Each domain encapsulates its own business rules.

Example:

Goal Service

Responsibilities:

* Goal CRUD
* Goal Graph updates
* Progress tracking
* Milestone management

Calendar Service

Responsibilities:

* Event synchronization
* Conflict detection
* Availability retrieval

Notification Service

Responsibilities:

* Daily Brief generation
* Reminder scheduling
* Alert prioritization

Research Service

Responsibilities:

* Knowledge Package generation
* Source indexing
* Research freshness

Each service owns its business rules.

---

# 18.9 Repository Layer

Repositories isolate persistence.

Example:

```typescript
GoalRepository

MemoryRepository

PreferenceRepository

DecisionRepository

ReflectionRepository
```

Repositories know Firestore.

Services do not.

---

# 18.10 Event Bus

Modules communicate through events.

Examples:

```text
GoalCreated

↓

PlanningRequested

↓

PlanGenerated

↓

CalendarUpdated

↓

ReminderScheduled

↓

LearningTriggered
```

Every event is immutable.

Events contain metadata for tracing and replay.

---

# 18.11 Dependency Injection

Every service is injected.

Example:

```typescript
GoalService

↓

MemoryService

↓

PlanningService

↓

CalendarService
```

Concrete implementations are never instantiated directly.

Dependency Injection improves testing and future extensibility.

---

# 18.12 Background Workers

Workers execute asynchronous workflows.

Examples:

Reminder Worker

↓

Notification Worker

↓

Reflection Worker

↓

Learning Worker

↓

Research Worker

↓

Calendar Sync Worker

Workers communicate only through the Event Bus.

---

# 18.13 Error Handling Strategy

Errors are classified into categories.

### Validation Errors

Incorrect user input.

HTTP 400.

---

### Authentication Errors

Invalid credentials.

HTTP 401.

---

### Authorization Errors

Permission denied.

HTTP 403.

---

### Domain Errors

Business rule violations.

HTTP 409.

---

### External Service Errors

Google API failures.

HTTP 503.

---

### Internal Errors

Unexpected failures.

HTTP 500.

All errors are logged with correlation IDs.

---

# 18.14 Configuration Management

Configuration is environment-driven.

Examples:

* Gemini Model
* Firestore Project
* OAuth Credentials
* Worker Schedule
* Retry Policies
* Feature Flags
* Rate Limits

No configuration is hardcoded.

---

# 18.15 Backend Interfaces

Example service contract.

```typescript
interface GoalService {

createGoal()

updateGoal()

deleteGoal()

generateExecutionGraph()

calculateProgress()

archiveGoal()

}
```

Example repository contract.

```typescript
interface GoalRepository {

findById()

save()

update()

delete()

search()

}
```

Interfaces define behavior.

Implementations remain replaceable.

---

# 18.16 Sequence Diagram

Example:

User creates a goal.

```text
Frontend

↓

GoalController

↓

Guardian Core

↓

Planning Engine

↓

Decision Engine

↓

Goal Service

↓

Goal Repository

↓

Firestore

↓

Event Bus

↓

Notification Worker

↓

Response
```

This sequence demonstrates the interaction between synchronous and asynchronous components.

---

# 18.17 Design Decisions

* Controllers remain thin.
* Guardian Core owns business intelligence.
* Services own business rules.
* Repositories own persistence.
* Events coordinate asynchronous workflows.
* Workers execute long-running tasks.
* Infrastructure remains isolated.

---

# 18.18 Architecture Decision Record (ADR-016)

### Decision

Implement the backend using a layered, modular architecture with Domain-Driven Design, Clean Architecture, dependency injection, repositories, and event-driven communication.

### Context

The platform requires high modularity, independent evolution of AI capabilities, and seamless integration with external services while remaining maintainable over time.

### Decision

Separate responsibilities into controllers, Guardian Core, domain services, repositories, adapters, workers, and infrastructure components connected through explicit interfaces and domain events.

### Consequences

**Benefits**

* Highly testable
* Easily extensible
* Strong separation of concerns
* Cloud-native scalability
* Independent evolution of modules

**Trade-offs**

* More initial implementation effort
* Larger codebase
* Additional interface definitions

---

# 18.19 Implementation Checklist

* [ ] Create the modular folder structure.
* [ ] Implement dependency injection.
* [ ] Build Guardian Core façade.
* [ ] Create domain services.
* [ ] Implement repositories.
* [ ] Build Event Bus.
* [ ] Implement background workers.
* [ ] Add centralized error handling.
* [ ] Configure environment management.
* [ ] Add structured logging and tracing.

---

# 18.20 Chapter Summary

The Backend Architecture defines the production implementation of Guardian Core as a layered, modular, event-driven platform.

By separating controllers, cognitive intelligence, domain services, repositories, adapters, infrastructure, and workers into independent components connected through explicit interfaces and domain events, the backend achieves high maintainability, scalability, and extensibility while preserving the architectural principles established throughout the earlier chapters.

---

### A note for the implementation phase

One thing is becoming clear from the level of detail in this specification: this architecture is moving beyond a typical hackathon project and toward a production platform. When we eventually translate this document into code, we should implement it **phase by phase** rather than trying to build every module at once.

A practical implementation order would be:

1. Core backend skeleton and dependency injection.
2. Guardian Core façade and event bus.
3. Firestore schema and repositories.
4. Authentication and Google integrations.
5. Cognitive pipeline and orchestration.
6. Planning and execution.
7. Learning and memory.
8. Workers and background automation.
9. Observability, testing, and optimization.

This sequence aligns directly with the architecture we've documented and minimizes rework while keeping the system functional at every stage.
