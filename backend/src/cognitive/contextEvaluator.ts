/**
 * Cognitive: Context & Capability Evaluation Engine
 * 
 * The central decision gate in the Guardian Core cognitive pipeline.
 * Every user request flows through this evaluator BEFORE any AI generation occurs.
 * 
 * Pipeline:
 *   User Request → Intent Detection → Capability Evaluation → Context Sufficiency → Action Decision
 * 
 * This prevents Guardian Core from:
 *   - Hallucinating information it doesn't have
 *   - Pretending tools are available that aren't connected
 *   - Generating research for tasks that don't need it
 *   - Writing emails/reports without sufficient context
 */
import { getToolRegistry } from "../db.js";
import type { ToolDefinition, MemoryContext } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type IntentType =
  | "scheduling"
  | "planning"
  | "reminder"
  | "research"
  | "email"
  | "report"
  | "general_assistance";

export type ActionType =
  | "execute"
  | "ask_clarification"
  | "schedule_only"
  | "provide_template"
  | "decline";

export interface ToolStatus {
  id: string;
  name: string;
  isConnected: boolean;
  isHealthy: boolean;
  operations: string[];
}

export interface ContextSufficiencyResult {
  isSufficient: boolean;
  missingFields: string[];
  availableFields: string[];
  sufficiencyScore: number; // 0-100
}

export interface ResearchRelevanceResult {
  shouldResearch: boolean;
  reason: string;
  confidence: number;
  category: "knowledge_intensive" | "routine_personal" | "ambiguous";
}

export interface ActionDecision {
  action: ActionType;
  reason: string;
  missingContext?: string[];
  template?: string;
  suggestedQuestions?: string[];
}

export interface ContextEvaluation {
  intent: IntentType;
  connectedTools: ToolStatus[];
  contextSufficiency: ContextSufficiencyResult;
  recommendedAction: ActionDecision;
  researchRelevance: ResearchRelevanceResult;
  confidence: number;
  evaluatedAt: string;
}

// ─── Intent Classifier ─────────────────────────────────────────────────────

/**
 * Classifies the user's primary intent from a goal title and context.
 * Uses keyword-based classification for speed; avoids an LLM call for every request.
 */
export function classifyIntent(title: string, context: string): IntentType {
  const combined = `${title} ${context}`.toLowerCase();

  // Email signals
  if (
    combined.includes("email") ||
    combined.includes("mail") ||
    combined.includes("send to") ||
    combined.includes("write to") ||
    combined.includes("draft to") ||
    combined.includes("message to")
  ) {
    return "email";
  }

  // Report/document signals
  if (
    combined.includes("report") ||
    combined.includes("essay") ||
    combined.includes("paper") ||
    combined.includes("thesis") ||
    combined.includes("write up") ||
    combined.includes("document") ||
    combined.includes("presentation")
  ) {
    return "report";
  }

  // Research signals
  if (
    combined.includes("research") ||
    combined.includes("learn") ||
    combined.includes("study") ||
    combined.includes("understand") ||
    combined.includes("explore")
  ) {
    return "research";
  }

  // Reminder-specific signals
  if (
    combined.includes("remind") ||
    combined.includes("reminder") ||
    combined.includes("don't forget") ||
    combined.includes("remember to")
  ) {
    return "reminder";
  }

  // Planning signals (complex multi-step goals)
  if (
    combined.includes("prepare") ||
    combined.includes("plan") ||
    combined.includes("organize") ||
    combined.includes("interview") ||
    combined.includes("project") ||
    combined.includes("build") ||
    combined.includes("develop") ||
    combined.includes("create")
  ) {
    return "planning";
  }

  // Default: scheduling (the primary product)
  return "scheduling";
}

// ─── Research Relevance Classifier ──────────────────────────────────────────

/**
 * Determines whether research would genuinely help with this task.
 * 
 * Categories:
 * - knowledge_intensive: Research IS useful (interview prep, learning, reports)
 * - routine_personal: Research is NOT useful (gym, bills, groceries)
 * - ambiguous: Needs more context to decide
 */
export function classifyResearchRelevance(
  title: string,
  context: string,
  intent: IntentType
): ResearchRelevanceResult {
  const combined = `${title} ${context}`.toLowerCase();

  // Routine/personal tasks — research is unnecessary
  const routinePatterns = [
    "bill", "pay", "payment", "gym", "workout", "exercise",
    "grocery", "groceries", "shopping", "buy", "purchase",
    "dentist", "doctor", "appointment", "meeting",
    "call", "phone", "pick up", "drop off",
    "clean", "laundry", "cook", "dinner",
    "sleep", "wake up", "morning routine",
    "commute", "drive", "walk",
  ];

  const isRoutine = routinePatterns.some(p => combined.includes(p));
  if (isRoutine && !combined.includes("research") && !combined.includes("learn")) {
    return {
      shouldResearch: false,
      reason: "This is a routine/personal task that does not benefit from external research.",
      confidence: 90,
      category: "routine_personal",
    };
  }

  // Knowledge-intensive tasks — research IS useful
  const knowledgePatterns = [
    "interview", "prepare for", "study", "learn",
    "exam", "test", "certification", "course",
    "project", "build", "develop", "code",
    "report", "essay", "paper", "thesis",
    "research", "investigate", "analyze",
    "design", "architecture", "system",
    "presentation", "pitch",
  ];

  const isKnowledgeIntensive = knowledgePatterns.some(p => combined.includes(p));
  if (isKnowledgeIntensive) {
    return {
      shouldResearch: true,
      reason: "This task involves knowledge acquisition that benefits from structured research.",
      confidence: 85,
      category: "knowledge_intensive",
    };
  }

  // Intent-based fallback
  if (intent === "research" || intent === "report") {
    return {
      shouldResearch: true,
      reason: "Task intent suggests research would be valuable.",
      confidence: 75,
      category: "knowledge_intensive",
    };
  }

  // Ambiguous — default to no research for safety
  return {
    shouldResearch: false,
    reason: "Insufficient signals to determine research value. Defaulting to scheduling-only.",
    confidence: 60,
    category: "ambiguous",
  };
}

// ─── Context Sufficiency Checker ────────────────────────────────────────────

/**
 * For each intent type, defines what context is required and checks availability.
 */
export function checkContextSufficiency(
  intent: IntentType,
  title: string,
  deadline: string,
  context: string
): ContextSufficiencyResult {
  const availableFields: string[] = [];
  const missingFields: string[] = [];

  // Universal fields
  if (title && title.trim().length > 0) availableFields.push("title");
  else missingFields.push("title");

  if (deadline && deadline.trim().length > 0) availableFields.push("deadline");
  else missingFields.push("deadline");

  if (context && context.trim().length > 0) availableFields.push("context");

  // Intent-specific requirements
  switch (intent) {
    case "email": {
      const contextLower = `${title} ${context}`.toLowerCase();
      if (!contextLower.match(/\b[\w.-]+@[\w.-]+\.\w+\b/) && !contextLower.includes("to ")) {
        missingFields.push("recipient");
      }
      if (!context || context.length < 20) {
        missingFields.push("email_purpose");
      }
      // Subject can sometimes be inferred from title
      break;
    }
    case "report": {
      if (!context || context.length < 10) {
        missingFields.push("report_topic_details");
      }
      // Requirements, format, organization context
      if (!context?.toLowerCase().includes("format") && !context?.toLowerCase().includes("requirement")) {
        missingFields.push("report_requirements");
      }
      break;
    }
    case "scheduling":
    case "reminder":
    case "planning":
    case "research":
    case "general_assistance":
      // Scheduling/reminder/planning primarily need title + deadline
      // which we already check universally above
      break;
  }

  const totalRequired = availableFields.length + missingFields.length;
  const sufficiencyScore = totalRequired > 0
    ? Math.round((availableFields.length / totalRequired) * 100)
    : 100;

  return {
    isSufficient: missingFields.length === 0,
    missingFields,
    availableFields,
    sufficiencyScore,
  };
}

// ─── Tool Awareness ─────────────────────────────────────────────────────────

/**
 * Queries the tool registry to build a real-time picture of connected capabilities.
 */
export async function getConnectedToolStatuses(): Promise<ToolStatus[]> {
  try {
    const registry = await getToolRegistry();
    return registry.map((tool: ToolDefinition) => ({
      id: tool.id,
      name: tool.name,
      isConnected: tool.availabilityStatus === "active",
      isHealthy: tool.healthStatus === "healthy",
      operations: tool.operations,
    }));
  } catch {
    // If tool registry is empty/unavailable, return baseline
    return [
      { id: "google_calendar", name: "Google Calendar", isConnected: false, isHealthy: false, operations: ["sync_sessions"] },
      { id: "google_tasks", name: "Google Tasks", isConnected: false, isHealthy: false, operations: ["create_task"] },
      { id: "gmail", name: "Gmail", isConnected: false, isHealthy: false, operations: ["create_draft", "send_email"] },
    ];
  }
}

/**
 * Checks if a specific tool action is currently possible.
 */
export async function canPerformAction(toolId: string, operation: string): Promise<boolean> {
  const tools = await getConnectedToolStatuses();
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return false;
  return tool.isConnected && tool.isHealthy && tool.operations.includes(operation);
}

/**
 * Generates a human-readable capability report for the AI to include in its context.
 */
export async function getCapabilityReport(): Promise<string> {
  const tools = await getConnectedToolStatuses();
  const connected = tools.filter(t => t.isConnected && t.isHealthy);
  const disconnected = tools.filter(t => !t.isConnected || !t.isHealthy);

  const lines: string[] = [
    "=== Guardian Core Capability Report ===",
    `Connected Tools (${connected.length}):`,
    ...connected.map(t => `  ✓ ${t.name}: ${t.operations.join(", ")}`),
  ];

  if (disconnected.length > 0) {
    lines.push(`Disconnected Tools (${disconnected.length}):`);
    lines.push(...disconnected.map(t => `  ✗ ${t.name}`));
  }

  lines.push("", "Capabilities:");
  lines.push("  ✓ Task scheduling and planning (always available)");
  lines.push("  ✓ Milestone generation (always available)");
  lines.push("  ✓ Dynamic reminders (always available)");
  lines.push("  ✓ Progress monitoring (always available)");

  if (connected.some(t => t.id === "google_calendar")) {
    lines.push("  ✓ Google Calendar sync and conflict detection");
  }
  if (connected.some(t => t.id === "google_tasks")) {
    lines.push("  ✓ Google Tasks synchronization");
  }
  if (connected.some(t => t.id === "gmail")) {
    lines.push("  ✓ Gmail draft creation and email sending");
  }

  return lines.join("\n");
}

// ─── Action Decider ─────────────────────────────────────────────────────────

/**
 * Based on intent, context sufficiency, and tool availability,
 * decides what action Guardian Core should take.
 */
export function decideAction(
  intent: IntentType,
  contextSufficiency: ContextSufficiencyResult,
  connectedTools: ToolStatus[],
  researchRelevance: ResearchRelevanceResult
): ActionDecision {
  // Priority 1: Always schedule if possible — scheduling is the core product
  const hasDeadline = contextSufficiency.availableFields.includes("deadline");
  const hasTitle = contextSufficiency.availableFields.includes("title");

  // For scheduling/reminder/planning: we primarily need title + deadline
  if (
    (intent === "scheduling" || intent === "reminder" || intent === "planning") &&
    hasTitle && hasDeadline
  ) {
    return {
      action: "execute",
      reason: "Sufficient context to schedule, plan, and generate milestones.",
    };
  }

  // For email intent without sufficient context
  if (intent === "email" && !contextSufficiency.isSufficient) {
    const questions = [];
    if (contextSufficiency.missingFields.includes("recipient")) {
      questions.push("Who should this email be sent to? (name or email address)");
    }
    if (contextSufficiency.missingFields.includes("email_purpose")) {
      questions.push("What is the purpose of this email? (e.g., follow-up, request, update)");
    }

    return {
      action: "provide_template",
      reason: "Cannot compose a complete email without knowing the recipient and purpose. Providing a professional template instead.",
      missingContext: contextSufficiency.missingFields,
      suggestedQuestions: questions,
      template: generateEmailTemplate(),
    };
  }

  // For report intent without sufficient context
  if (intent === "report" && !contextSufficiency.isSufficient) {
    return {
      action: "provide_template",
      reason: "Cannot generate report content without knowing the topic details and requirements. Providing a structure template.",
      missingContext: contextSufficiency.missingFields,
      suggestedQuestions: [
        "What is the specific topic of this report?",
        "Are there any formatting requirements or guidelines?",
        "What organization or course is this report for?",
      ],
      template: generateReportTemplate(),
    };
  }

  // If we have title but no deadline, ask for deadline (core scheduling need)
  if (hasTitle && !hasDeadline) {
    return {
      action: "ask_clarification",
      reason: "A deadline is needed to schedule this task effectively.",
      missingContext: ["deadline"],
      suggestedQuestions: ["When does this need to be completed?"],
    };
  }

  // If nothing is available
  if (!hasTitle) {
    return {
      action: "ask_clarification",
      reason: "Not enough information to proceed. Need at minimum a task title.",
      missingContext: contextSufficiency.missingFields,
      suggestedQuestions: ["What would you like to accomplish?"],
    };
  }

  // Default: schedule it (core product philosophy)
  return {
    action: "schedule_only",
    reason: "Scheduling the task. Additional assistance will be available once more context is provided.",
  };
}

// ─── Template Generators ────────────────────────────────────────────────────

function generateEmailTemplate(): string {
  return `
## Professional Email Template

**To:** [Recipient Name / Email]
**Subject:** [Clear, specific subject line]

---

Dear [Recipient Name],

[Opening: State the purpose of the email in 1-2 sentences]

[Body: Provide necessary details, context, or requests]

[Closing: Summarize any action items or next steps]

Best regards,
[Your Name]
[Your Position/Title]

---
*Guardian Core can draft and send this email once you provide the recipient, subject, and purpose.*
  `.trim();
}

function generateReportTemplate(): string {
  return `
## Report Structure Template

### 1. Title Page
- Report title, author, date, organization

### 2. Executive Summary
- 150-300 word overview of key findings

### 3. Introduction
- Background, objectives, scope

### 4. Methodology
- Approach, tools, frameworks used

### 5. Findings / Implementation
- Main content sections with evidence

### 6. Results & Discussion
- Analysis of outcomes

### 7. Conclusion & Recommendations
- Summary and actionable recommendations

### 8. References
- Sources cited

---
*Guardian Core can help fill in each section once you provide the topic details and requirements.*
  `.trim();
}

// ─── Main Evaluation Pipeline ───────────────────────────────────────────────

/**
 * The complete Context Evaluation Pipeline.
 * Call this at the start of every goal creation cycle.
 */
export async function evaluateContext(
  title: string,
  deadline: string,
  context: string
): Promise<ContextEvaluation> {
  console.log(`[ContextEvaluator] Evaluating context for: "${title}"`);

  // Step 1: Intent Detection
  const intent = classifyIntent(title, context);
  console.log(`[ContextEvaluator] Intent classified: ${intent}`);

  // Step 2: Capability Evaluation (What tools are connected?)
  const connectedTools = await getConnectedToolStatuses();
  const activeToolCount = connectedTools.filter(t => t.isConnected).length;
  console.log(`[ContextEvaluator] Connected tools: ${activeToolCount}/${connectedTools.length}`);

  // Step 3: Context Sufficiency Check
  const contextSufficiency = checkContextSufficiency(intent, title, deadline, context);
  console.log(`[ContextEvaluator] Context sufficiency: ${contextSufficiency.sufficiencyScore}% (missing: ${contextSufficiency.missingFields.join(", ") || "none"})`);

  // Step 4: Research Relevance
  const researchRelevance = classifyResearchRelevance(title, context, intent);
  console.log(`[ContextEvaluator] Research relevance: ${researchRelevance.category} (shouldResearch: ${researchRelevance.shouldResearch})`);

  // Step 5: Action Decision
  const recommendedAction = decideAction(intent, contextSufficiency, connectedTools, researchRelevance);
  console.log(`[ContextEvaluator] Recommended action: ${recommendedAction.action} — ${recommendedAction.reason}`);

  // Overall confidence = weighted average of sub-scores
  const confidence = Math.round(
    (contextSufficiency.sufficiencyScore * 0.4) +
    (researchRelevance.confidence * 0.3) +
    ((activeToolCount / Math.max(connectedTools.length, 1)) * 100 * 0.3)
  );

  return {
    intent,
    connectedTools,
    contextSufficiency,
    recommendedAction,
    researchRelevance,
    confidence,
    evaluatedAt: new Date().toISOString(),
  };
}
