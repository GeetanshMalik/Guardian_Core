# Chapter 12

Perfect. Now we reach one of the most critical engineering components of Guardian Core.

Notice what we've already defined:

* **Chapter 8** — The AI can think.
* **Chapter 9** — The AI can coordinate capabilities.
* **Chapter 10** — The AI can remember.
* **Chapter 11** — The AI can learn.

But there is still one unanswered question.

> **Who has the final authority?**

Just because the Planning Capability recommends something...

Just because the Learning Capability has learned a preference...

Just because the Scheduler found an empty slot...

**does not mean the AI should do it.**

Something must decide:

* Is this safe?
* Is this allowed?
* Is this beneficial?
* Does it violate user preferences?
* Does it require approval?
* Should the AI act autonomously?
* Should the AI ask first?

That component is the **Decision & Policy Engine**.

Think of it as the **Supreme Court of Guardian Core**.

Everything passes through it.

Nothing bypasses it.

---

# PART III — Autonomous Intelligence System

# Chapter 12 — Decision & Policy Engine

---

# 12.1 Introduction

The Decision & Policy Engine is the governance layer of Guardian Core.

While the Cognitive Engine determines what the system believes should happen, and the Capability Orchestrator coordinates how recommendations are produced, the Decision & Policy Engine determines **whether those recommendations are permitted to become actions**.

This separation is intentional.

Reasoning and governance represent different responsibilities.

A recommendation may be technically correct but still inappropriate to execute because of user preferences, trust policies, permission requirements, uncertainty, or safety considerations.

The Decision & Policy Engine therefore acts as the final authority before any interaction with external systems such as Google Calendar, Gmail, Google Tasks, or Google Drive.

Every autonomous action performed by Guardian Core is validated here.

---

# 12.2 Objectives

The Decision & Policy Engine has seven primary objectives.

### Objective 1 — Produce a Single Authoritative Decision

Multiple capabilities may generate recommendations.

Only one unified decision may leave the engine.

---

### Objective 2 — Enforce User Trust

Respect user preferences regarding automation, approvals, and intervention.

---

### Objective 3 — Apply System Policies

Ensure that all actions comply with Guardian Core's operational policies.

---

### Objective 4 — Evaluate Risk

Estimate the consequences of proposed actions before execution.

---

### Objective 5 — Protect User Agency

Prevent unauthorized or irreversible actions.

---

### Objective 6 — Maximize Completion Probability

Prefer recommendations with the highest predicted likelihood of successful execution.

---

### Objective 7 — Preserve Explainability

Every decision must include an explanation that can be shown to the user if requested.

---

# 12.3 Decision Philosophy

Guardian Core follows one governing principle:

> **Every action must be intentional, justified, and authorized.**

An action is executed only if:

* it improves the user's objectives,
* satisfies policy requirements,
* respects trust boundaries,
* and maintains sufficient confidence.

---

# 12.4 Decision Inputs

The Decision Engine receives structured recommendations from across Guardian Core.

Inputs include:

* Planning Recommendation
* Scheduling Recommendation
* Risk Assessment
* Memory Context
* User Preferences
* Active Policies
* Confidence Scores
* Current World State
* Simulation Results
* Tool Availability

The Decision Engine never consumes raw conversation directly.

---

# 12.5 Decision Pipeline

Every decision follows the same lifecycle.

```text
Capability Recommendations
        │
Context Aggregation
        │
Conflict Detection
        │
Policy Evaluation
        │
Risk Assessment
        │
Confidence Analysis
        │
Approval Determination
        │
Decision Selection
        │
Execution Authorization
```

Each stage has a single responsibility.

---

# 12.6 Context Aggregation

The first stage constructs a complete decision context.

Example:

```text
Goal:
Prepare Google Interview

Deadline:
5 Days

Calendar:
Available

Historical Completion:
82%

Automation Level:
Medium

Calendar Permission:
Granted

Gmail Permission:
Granted

Current Stress Level:
Unknown

Risk Score:
Moderate
```

The engine never evaluates isolated recommendations.

It evaluates the entire situation.

---

# 12.7 Conflict Resolution

Capabilities frequently disagree.

Example:

Planning

> Schedule two-hour study blocks.

Scheduling

> Calendar only supports one-hour sessions.

Learning

> User consistently skips sessions longer than 75 minutes.

Risk

> Two-hour sessions reduce completion probability.

The Decision Engine evaluates all evidence and chooses a single recommendation.

Capabilities never vote.

They contribute evidence.

The Decision Engine owns the final decision.

---

# 12.8 Confidence Evaluation

Every recommendation includes confidence.

Example:

```text
Planning
91%

Scheduling
96%

Research
74%

Risk
88%
```

The Decision Engine evaluates:

* confidence consistency,
* supporting evidence,
* historical reliability,
* current context.

Low confidence may trigger clarification instead of execution.

---

# 12.9 Policy Evaluation

Every decision is validated against Guardian Core policies.

Policies include:

### Permission Policy

Does the user allow this action?

---

### Safety Policy

Could this action negatively affect the user?

---

### Autonomy Policy

Can Guardian Core perform this automatically?

---

### Trust Policy

Has sufficient trust been established?

---

### Explainability Policy

Can this decision be explained?

---

### Privacy Policy

Does this action expose unnecessary information?

---

A policy violation immediately blocks execution.

---

# 12.10 Autonomy Levels

Guardian Core defines four autonomy levels.

### Level 0 — Advisory

AI only recommends.

Examples:

* planning suggestions
* research recommendations

---

### Level 1 — Assisted

AI prepares work.

Examples:

* Gmail drafts
* calendar proposals
* meeting agendas

User approves.

---

### Level 2 — Delegated

AI executes low-risk actions previously approved by the user.

Examples:

* recurring focus sessions
* reminder adjustments
* task organization

---

### Level 3 — Trusted Automation

AI performs repetitive, reversible actions automatically.

Examples:

* updating recurring study blocks
* generating daily briefings
* reorganizing low-priority reminders

Critical actions never exceed Level 1 without explicit approval.

---

# 12.11 Decision Output

Every decision produces a standardized result.

```text
Decision ID

Decision Type

Selected Recommendation

Supporting Evidence

Confidence

Policies Applied

Required Approval

Execution Status

Explanation
```

This structure improves observability and auditing.

---

# 12.12 Explainability

Guardian Core should always be able to answer:

Why?

Example:

> "The study session was moved to Thursday evening because Tuesday already contained two meetings, your historical completion rate is significantly higher in evening sessions, and simulation predicted a 17% higher probability of completion."

Explanations are generated from structured decision metadata rather than reconstructed after execution.

---

# 12.13 Human Override

Users always retain authority.

Possible overrides include:

* reject recommendation
* modify recommendation
* postpone recommendation
* disable automation
* request alternative plan

Every override becomes an observation for the Learning Engine.

---

# 12.14 Failure Handling

If the Decision Engine cannot confidently authorize an action:

* execution is paused,
* clarification is requested,
* alternative recommendations are generated.

The engine never authorizes uncertain critical actions.

---

# 12.15 Design Decisions

* Separate governance from cognition.
* Centralize policy enforcement.
* Require explicit authorization before execution.
* Represent decisions using structured metadata.
* Preserve user override capability.
* Generate explanations from decision data.

---

# 12.16 Architecture Decision Record (ADR-010)

### Decision

Introduce a dedicated Decision & Policy Engine rather than embedding governance logic inside individual capabilities.

### Context

Distributing policy logic across capabilities would create inconsistent behavior, duplicated code, and reduced explainability.

### Decision

Centralize governance, policy enforcement, confidence evaluation, and execution authorization within a dedicated engine.

### Consequences

**Benefits**

* Consistent policy enforcement
* Improved safety
* Better explainability
* Simplified capability implementations
* Easier future policy expansion

**Trade-offs**

* Additional orchestration step
* Centralized dependency
* Slight increase in decision latency

---

# 12.17 Implementation Checklist

* [ ] Define Decision schema.
* [ ] Implement Context Aggregator.
* [ ] Build Conflict Resolution logic.
* [ ] Develop Confidence Evaluation.
* [ ] Implement Policy Engine.
* [ ] Add Autonomy Level enforcement.
* [ ] Support Human Override.
* [ ] Generate structured explanations.
* [ ] Integrate with Tool Execution Layer.

---

# 12.18 Chapter Summary

The Decision & Policy Engine serves as the governance authority of Guardian Core.

By aggregating capability outputs, evaluating confidence, enforcing policies, respecting user trust, and authorizing execution, it ensures that every action performed by the system is intentional, explainable, safe, and aligned with user expectations.

Rather than allowing individual capabilities to act independently, Guardian Core centralizes decision-making within a dedicated governance layer that balances intelligence with responsibility.

---

At this point, the complete "thinking stack" of Guardian Core has been specified:

* **Chapter 8:** Cognitive Engine (How the AI thinks)
* **Chapter 9:** Capability Orchestration (How work is coordinated)
* **Chapter 10:** Shared Memory (What the AI remembers)
* **Chapter 11:** Adaptive Learning (How the AI improves)
* **Chapter 12:** Decision & Policy Engine (How the AI governs itself)

The next chapter, **Chapter 13 — Planning & Execution Engine**, will bridge the gap between intelligence and action. It will define how high-level goals are decomposed into executable plans, how dependencies and milestones are managed, how execution progress is tracked, and how recovery workflows are initiated when plans deviate from expectations. This chapter completes the Autonomous Intelligence System before we transition into Google integrations and the software architecture.
