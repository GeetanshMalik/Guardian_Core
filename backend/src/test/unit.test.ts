import { describe, it, beforeEach, expect } from "./framework.js";
import { encrypt, decrypt } from "../infrastructure/encryption.js";
import { signJwt, verifyJwt } from "../infrastructure/jwt.js";
import { ConstitutionEngine } from "../cognitive/constitution.js";
import { CognitiveState } from "../cognitive/types.js";
import { goalService } from "../domain/goals/goalService.js";
import { classifyIntent, classifyResearchRelevance, decideAction, checkContextSufficiency } from "../cognitive/contextEvaluator.js";
import { computeReminders } from "../domain/reminders/reminderEngine.js";
import { Goal } from "../types.js";

describe("Unit Tests: Cryptography & Security", () => {
  it("should encrypt and decrypt values using AES-256-GCM", () => {
    const secretMessage = "MySuperSecretGoogleOAuthRefreshToken123";
    const encrypted = encrypt(secretMessage);
    
    expect(encrypted).toExist();
    expect(encrypted.split(":").length).toBe(3); // iv:ciphertext:tag
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secretMessage);
  });

  it("should return same text for decryption fallback when key is not encrypted format", () => {
    const plaintext = "already-plaintext-token";
    const decrypted = decrypt(plaintext);
    expect(decrypted).toBe(plaintext);
  });

  it("should sign and verify JWT tokens", () => {
    const payload = { userId: "user-123", role: "admin" };
    const token = signJwt(payload, 3600);
    
    expect(token).toExist();
    expect(token.split(".").length).toBe(3);

    const verified = verifyJwt(token);
    expect(verified).toExist();
    expect(verified.userId).toBe("user-123");
    expect(verified.role).toBe("admin");
  });

  it("should return null for expired JWT tokens", async () => {
    const payload = { userId: "user-123" };
    // Sign with negative expiry (already expired)
    const token = signJwt(payload, -10);
    const verified = verifyJwt(token);
    expect(verified).toBe(null);
  });

  it("should return null for invalid token signature", () => {
    const payload = { userId: "user-123" };
    const token = signJwt(payload, 3600);
    const brokenToken = token.slice(0, -5) + "abcde"; // corrupt signature
    const verified = verifyJwt(brokenToken);
    expect(verified).toBe(null);
  });
});

describe("Unit Tests: Constitution Validation", () => {
  let mockState: CognitiveState;

  beforeEach(() => {
    mockState = {
      currentStage: "PLAN",
      history: [],
      worldModel: {
        timestamp: new Date().toISOString(),
        activeGoals: [],
        upcomingDeadlines: [],
        userPreferences: {
          avoidWeekends: false,
          avoidMornings: false,
          workHoursStart: "19:00",
          workHoursEnd: "21:00",
          preferredSessionMinutes: 60
        }
      },
      memoryContext: {
        preferences: [],
        semanticFacts: [],
        recentEpisodes: [],
        historicalDecisions: [],
        activeReflections: []
      },
      workingMemory: {
        transientNotes: ["All checks passed", "Includes explanation and justification for planning"],
        negotiationLog: [],
        decisionsMade: [],
        proposedSchedule: []
      },
      confidence: {
        intent: 90,
        planning: 85,
        scheduling: 88,
        decision: 87
      }
    };
  });

  it("should pass verification under normal conditions", () => {
    const constitution = new ConstitutionEngine();
    const result = constitution.validateDecision(mockState);
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it("should fail validation if Google sync is triggered during planning (Article I violation)", () => {
    mockState.workingMemory.transientNotes.push("Triggering Calendar Sync automatically in planning phase");
    const constitution = new ConstitutionEngine();
    const result = constitution.validateDecision(mockState);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain("Violation (Article I)");
  });

  it("should fail validation if weekend schedules are proposed when avoidWeekends is true (Article V violation)", () => {
    mockState.worldModel.userPreferences.avoidWeekends = true;
    // Saturday date
    mockState.workingMemory.proposedSchedule = [{
      id: "session-1",
      taskId: "t1",
      title: "Weekend Study",
      date: "2026-06-27", // Saturday
      startTime: "10:00",
      endTime: "12:00",
      status: "pending",
      googleEventId: null
    }];

    const constitution = new ConstitutionEngine();
    const result = constitution.validateDecision(mockState);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain("Violation (Article V)");
  });

  it("should warn if no explanation rationale is present in transient notes (Article III warning)", () => {
    mockState.workingMemory.transientNotes = ["Goal is simple"];
    const constitution = new ConstitutionEngine();
    const result = constitution.validateDecision(mockState);
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("Warning (Article III)");
  });
});

describe("Unit Tests: Context & Capability Evaluation Engine", () => {

  it("should classify intents correctly based on title and context", () => {
    const emailIntent = classifyIntent("Write follow-up email to manager", "Send the details of project.");
    const reportIntent = classifyIntent("Generate annual sales report", "Organize sections logically.");
    const researchIntent = classifyIntent("Study distributed systems", "Understand mapreduce.");
    const schedulingIntent = classifyIntent("Buy groceries", "Needs to be done by 5 PM.");

    expect(emailIntent).toBe("email");
    expect(reportIntent).toBe("report");
    expect(researchIntent).toBe("research");
    expect(schedulingIntent).toBe("scheduling");
  });

  it("should gate research appropriately based on relevance classification", () => {
    const interviewRelevance = classifyResearchRelevance("Prepare for Google interview", "Review DSA and system design patterns.", "planning");
    const groceryRelevance = classifyResearchRelevance("Buy groceries", "Milk, eggs, and bread.", "scheduling");

    expect(interviewRelevance.shouldResearch).toBe(true);
    expect(interviewRelevance.category).toBe("knowledge_intensive");
    expect(groceryRelevance.shouldResearch).toBe(false);
    expect(groceryRelevance.category).toBe("routine_personal");
  });

  it("should check context sufficiency correctly", () => {
    const sufficientEmail = checkContextSufficiency("email", "Send email to test@example.com", "Friday", "Draft a quick follow-up to ask for project updates.");
    const insufficientEmail = checkContextSufficiency("email", "Send email", "Friday", "");

    expect(sufficientEmail.isSufficient).toBe(true);
    expect(insufficientEmail.isSufficient).toBe(false);
    expect(insufficientEmail.missingFields.includes("recipient")).toBe(true);
    expect(insufficientEmail.missingFields.includes("email_purpose")).toBe(true);
  });

  it("should make correct action decisions", () => {
    const insufficientEmailCheck = checkContextSufficiency("email", "Send email", "Friday", "");
    const decision = decideAction("email", insufficientEmailCheck, [], { shouldResearch: false, reason: "", confidence: 100, category: "routine_personal" });
    
    expect(decision.action).toBe("provide_template");
    expect(decision.missingContext.includes("recipient")).toBe(true);
  });
});

describe("Unit Tests: Dynamic Reminder Engine", () => {

  it("should calculate correct percentage-based dynamic reminders", () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const deadline = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours from now

    const mockGoal: Goal = {
      id: "g-test-reminders",
      title: "Test Goal",
      deadline: deadline.toISOString(),
      context: "",
      createdAt: createdAt.toISOString(),
      status: "active",
      plan: {
        tasks: [],
        schedule: []
      }
    };

    const reminders = computeReminders(mockGoal);
    expect(reminders.length).toBeGreaterThan(0);
    
    // Check that we have percentage and deadline_approaching reminders
    const hasPercentage = reminders.some(r => r.type === "percentage");
    const hasApproaching = reminders.some(r => r.type === "deadline_approaching");
    expect(hasPercentage).toBe(true);
    expect(hasApproaching).toBe(true);
  });
});
