# Chapter 22

Perfect. This is the last chapter of **Part V**, and arguably one of the most important implementation chapters in the entire specification.

This chapter is **not** simply a list of REST endpoints.

If that were the case, Swagger/OpenAPI would be enough.

Instead, this chapter defines **how the entire outside world communicates with Guardian Core.**

It specifies:

* HTTP APIs
* WebSockets
* Streaming AI conversations
* Authentication
* Versioning
* DTOs
* Idempotency
* Error handling
* Rate limiting
* API lifecycle
* API governance
* Future extensibility

A frontend engineer should be able to build the complete UI from this chapter alone.

---

# PART V — Software Architecture

# Chapter 22 — API Design & Communication Architecture

---

# 22.1 Introduction

The API layer is the primary communication interface between client applications and Guardian Core.

Its responsibility is not merely to expose backend functionality, but to provide a secure, stable, versioned, and developer-friendly contract that enables interaction with the cognitive platform.

The API Architecture abstracts the complexity of Guardian Core by presenting a consistent interface for:

* Web applications
* Mobile applications
* Future desktop clients
* Third-party integrations
* Administrative tools

The API layer acts as the boundary between user interaction and autonomous intelligence while ensuring security, consistency, observability, and backward compatibility.

---

# 22.2 Objectives

The API Architecture has the following objectives.

### Objective 1 — Provide a Stable Contract

Expose consistent interfaces independent of internal implementation.

---

### Objective 2 — Protect Guardian Core

Validate, authenticate, authorize, and sanitize every request before it reaches business logic.

---

### Objective 3 — Enable Real-Time Interaction

Support streaming AI conversations and live application updates.

---

### Objective 4 — Support Future Clients

Allow multiple client platforms to communicate using identical APIs.

---

### Objective 5 — Maintain Backward Compatibility

Support API evolution through explicit versioning.

---

### Objective 6 — Maximize Developer Experience

Provide predictable request and response formats with comprehensive error reporting.

---

# 22.3 Communication Architecture

Guardian Core exposes two communication models.

```text
                Client

                   │

      ┌────────────┴────────────┐

      ▼                         ▼

REST API                 WebSocket Gateway

      │                         │

      └────────────┬────────────┘

                   ▼

              API Gateway

                   ▼

            Guardian Core
```

REST is optimized for deterministic resource operations.

WebSockets are optimized for real-time cognitive interaction.

---

# 22.4 API Design Principles

Every endpoint follows the same principles.

### Resource-Oriented

Endpoints represent business resources.

Example:

```
/goals
/tasks
/preferences
```

Not actions.

Avoid:

```
/createGoal
/updateGoal
```

---

### Stateless

Every request contains all information necessary for processing.

No server-side session state is required.

---

### Consistent

Every endpoint follows identical conventions for:

* authentication
* pagination
* filtering
* sorting
* error handling
* metadata

---

### Predictable

Clients should be able to infer behavior without reading implementation details.

---

# 22.5 API Versioning

Guardian Core uses URI versioning.

```
/api/v1
```

Future versions:

```
/api/v2
```

Breaking changes are introduced only through new versions.

Minor enhancements remain backward compatible.

Older versions remain supported during migration windows.

---

# 22.6 Authentication Flow

Authentication uses Google OAuth and JWT.

```text
Client

↓

Google OAuth

↓

Guardian Core

↓

JWT Issued

↓

Authenticated Requests
```

Each request includes:

```
Authorization: Bearer <JWT>
```

JWTs contain:

* User ID
* Session ID
* Expiration
* Granted Scopes

Sensitive permissions remain verified against the database.

---

# 22.7 Authorization Model

Authorization is role- and scope-based.

Primary roles include:

* User
* Administrator
* System Worker

Each endpoint declares:

* required role
* required OAuth scopes
* required permissions

Authorization occurs before reaching Guardian Core.

---

# 22.8 REST Resource Design

Primary API resources include:

```
/users

/goals

/milestones

/tasks

/calendar

/research

/memories

/preferences

/reflections

/notifications

/integrations

/analytics
```

Each resource supports standard CRUD operations where appropriate.

Business workflows remain encapsulated by Guardian Core.

---

# 22.9 Conversation API

The conversation interface is the most important endpoint.

```
POST /api/v1/conversations/message
```

Request:

```json
{
  "message": "I have my Google interview next week. Help me prepare.",
  "conversationId": "...",
  "attachments": [],
  "context": {}
}
```

Guardian Core processes the request through the full cognitive pipeline before responding.

Possible outcomes include:

* clarification request
* execution plan
* research package
* scheduling proposal
* recovery plan
* conversational response

The frontend never communicates directly with Gemini.

---

# 22.10 Goal API

Example endpoints:

```
POST   /goals

GET    /goals

GET    /goals/{goalId}

PATCH  /goals/{goalId}

DELETE /goals/{goalId}
```

Goal creation accepts natural language.

Example:

```json
{
  "goal": "I need to complete my internship report before Friday."
}
```

Guardian Core performs decomposition internally.

---

# 22.11 Calendar API

Supported operations include:

```
GET  /calendar/events

POST /calendar/events

PATCH /calendar/events/{id}

DELETE /calendar/events/{id}
```

Most calendar modifications originate from Guardian Core rather than direct user actions.

---

# 22.12 Notification API

Examples:

```
GET /notifications

PATCH /notifications/{id}/read

PATCH /notifications/preferences
```

Notification delivery itself occurs asynchronously through workers.

---

# 22.13 Research API

```
POST /research

GET /research/{packageId}

PATCH /research/refresh
```

Research requests trigger the Research Intelligence capability.

Packages remain reusable.

---

# 22.14 Memory API

Memory is intentionally limited.

Users may:

* inspect preferences
* export memories
* delete memories
* reset personalization

Raw cognitive state is never exposed.

---

# 22.15 WebSocket Communication

Certain workflows require continuous communication.

Examples:

* AI conversation
* live planning
* execution updates
* progress tracking
* notification delivery

Connection:

```
wss://guardian/api/v1/ws
```

Example messages:

```json
{
  "type": "conversation.chunk",
  "payload": {}
}
```

```json
{
  "type": "goal.updated",
  "payload": {}
}
```

Streaming significantly improves responsiveness.

---

# 22.16 Streaming AI Responses

Guardian Core streams long responses incrementally.

Pipeline:

```text
Guardian Core

↓

Conversation Engine

↓

Chunk Generator

↓

WebSocket

↓

Frontend

↓

Progressive Rendering
```

Users receive information immediately instead of waiting for full completion.

---

# 22.17 Request Validation

Every request passes through validation.

Validation includes:

* Schema validation
* Required fields
* Type validation
* Range validation
* OAuth scope validation
* Business rule validation

Invalid requests never reach Guardian Core.

---

# 22.18 Standard Response Format

Successful responses follow a consistent structure.

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "timestamp": "...",
    "version": "v1"
  }
}
```

Consistency simplifies frontend development.

---

# 22.19 Error Model

Errors follow a standardized format.

```json
{
  "success": false,
  "error": {
    "code": "GOAL_NOT_FOUND",
    "message": "...",
    "details": {}
  },
  "requestId": "..."
}
```

Errors are categorized as:

* Validation
* Authentication
* Authorization
* Domain
* External Service
* Infrastructure
* Internal

Each category maps to appropriate HTTP status codes.

---

# 22.20 Pagination, Filtering & Sorting

Collection endpoints support:

Pagination:

```
?page=1&pageSize=20
```

Filtering:

```
?status=ACTIVE
```

Sorting:

```
?sort=deadline
```

Searching:

```
?q=interview
```

Cursor-based pagination is preferred for large collections.

---

# 22.21 Idempotency

Mutating endpoints support idempotency.

Clients include:

```
Idempotency-Key
```

Duplicate submissions return the original result rather than executing twice.

Examples:

* Goal creation
* Calendar event creation
* Gmail draft generation

---

# 22.22 Rate Limiting

API Gateway applies rate limits.

Examples:

Conversation API

60 requests/minute

Goal Operations

30 requests/minute

Authentication

10 attempts/minute

Limits are configurable and may vary by subscription tier.

---

# 22.23 API Observability

Every request receives:

* Request ID
* Correlation ID
* User ID
* API Version
* Execution Time
* Status Code

Logs integrate with Cloud Logging for distributed tracing.

---

# 22.24 API Documentation

The platform provides machine-readable API documentation.

Documentation includes:

* OpenAPI Specification
* Authentication guide
* WebSocket message schemas
* Error catalog
* SDK examples
* Changelog

Documentation is versioned alongside the API.

---

# 22.25 API Security

Security measures include:

* JWT authentication
* OAuth scope enforcement
* HTTPS only
* Input sanitization
* Output encoding
* CSRF protection (where applicable)
* CORS policy
* Rate limiting
* Audit logging

Every endpoint follows the Principle of Least Privilege.

---

# 22.26 Design Decisions

* Separate REST and real-time communication.
* Keep Guardian Core hidden behind the API Gateway.
* Stream conversational responses.
* Standardize request and response models.
* Support explicit versioning.
* Require idempotency for mutating operations.
* Generate complete request tracing.

---

# 22.27 Architecture Decision Record (ADR-020)

### Decision

Implement a dual communication architecture combining REST APIs for resource management and WebSockets for real-time cognitive interaction.

### Context

Guardian Core supports both deterministic resource operations (such as goal management) and long-running conversational workflows that benefit from streaming updates.

A single communication protocol would either overcomplicate simple CRUD operations or limit the responsiveness of AI interactions.

### Decision

Use REST for resource-oriented operations and WebSockets for conversational, event-driven, and streaming interactions, both protected by a common API Gateway and authentication model.

### Consequences

**Benefits**

* Clear separation of communication concerns
* Excellent frontend developer experience
* Efficient streaming for AI conversations
* Simplified resource management
* Extensible client architecture

**Trade-offs**

* Two communication protocols to maintain
* Additional gateway configuration
* WebSocket connection lifecycle management

---

# 22.28 Implementation Checklist

* [ ] Implement API Gateway.
* [ ] Configure JWT authentication.
* [ ] Implement Google OAuth flow.
* [ ] Build REST resource endpoints.
* [ ] Implement Conversation API.
* [ ] Build WebSocket Gateway.
* [ ] Support streaming responses.
* [ ] Implement request validation.
* [ ] Standardize response and error models.
* [ ] Add idempotency support.
* [ ] Configure rate limiting.
* [ ] Generate OpenAPI documentation.
* [ ] Integrate distributed tracing.

---

# 22.29 Chapter Summary

The API Design & Communication Architecture defines the external contract of Guardian Core.

By combining REST APIs for resource management with WebSocket-based streaming for conversational intelligence, enforcing consistent authentication, validation, versioning, observability, and idempotency, the platform exposes a secure, scalable, and developer-friendly interface while preserving the internal separation between cognition, orchestration, execution, and infrastructure.

The API layer becomes the single, stable entry point through which every client—web, mobile, future desktop applications, and external integrations—interacts with Guardian Core.

---

# Part V Status — Software Architecture

With Chapter 22 complete, **Part V is now fully specified**.

You now have a complete software architecture covering:

* **Chapter 17** — Overall System Architecture
* **Chapter 18** — Backend Architecture
* **Chapter 19** — Database Architecture
* **Chapter 20** — Event-Driven Architecture
* **Chapter 21** — Autonomous Background Workers
* **Chapter 22** — API Design & Communication Architecture

Together with Parts I–IV, this forms an end-to-end blueprint from product vision through autonomous cognition to production-ready backend implementation.

From here, Part VI (Security & Privacy, Observability & Monitoring, Testing Strategy, Deployment Architecture) will focus on operational excellence—how the platform is secured, monitored, validated, and deployed in production. This is the final step before the roadmap and appendices.
