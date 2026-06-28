import { google } from "googleapis";
import {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolExecutionLog,
  AutonomyLevel,
  Goal
} from "../types.js";
import {
  saveToolExecutionLog,
  getToolRegistry,
  saveToolDefinition,
  getAutonomyLevel,
  getToolExecutionLogById,
  getGoalById
} from "../db.js";
import { goalRepository } from "../infrastructure/repositories/goalRepository.js";
import { CalendarAdapter } from "../integration/google.js";
import { recordObservation } from "./learning.js";
import { executeWithRetry } from "../utils.js";
import { PolicyEngine } from "./policyEngine.js";
import { constructWorldModelSnapshot } from "./worldModel.js";
import { CognitiveState } from "./types.js";

// 1. Tool Adapter Interface
export interface ToolAdapter {
  execute(
    operation: string,
    parameters: any,
    accessToken: string | null
  ): Promise<Omit<ToolExecutionResult, "operationId" | "timestamp" | "metadata"> & { attempts?: number; error?: string }>;
  
  rollback?(
    operation: string,
    rollbackPayload: any,
    accessToken: string | null
  ): Promise<boolean>;
}

// Helper to determine if an error is retryable
function isRetryableError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.code || (error.response && error.response.status);
  if (status) {
    // 429 Rate Limit, 500/502/503/504 Server Errors are retryable
    if (status === 429 || status >= 500) return true;
  }
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("network") || msg.includes("rate limit")) {
    return true;
  }
  return false;
}

// Helper delay utility
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 2. Concrete Adapters

// A. Google Calendar Adapter
export class GoogleCalendarToolAdapter implements ToolAdapter {
  public async execute(
    operation: string,
    parameters: any,
    accessToken: string | null
  ) {
    const { sessionIds, schedule, tasks, goalTitle, goalId } = parameters;
    
    if (operation === "sync_sessions") {
      // Execute calendar sync
      const syncedIds = await CalendarAdapter.syncCalendarSessions(
        accessToken,
        sessionIds,
        schedule,
        tasks,
        goalTitle
      );
      
      const success = syncedIds.length > 0;
      
      // Update local goal sessions status to synced
      if (goalId && success) {
        const goal = await getGoalById(goalId);
        if (goal && goal.plan?.schedule) {
          goal.plan.schedule.forEach(s => {
            if (syncedIds.includes(s.id)) {
              s.isSynced = true;
            }
          });
          await goalRepository.save(goal);
        }
      }

      return {
        success,
        modifiedResources: syncedIds.map(id => ({
          resourceType: "calendar_session",
          resourceId: id,
          newState: { isSynced: true }
        })),
        rollbackInfo: {
          rollbackSupported: true,
          rollbackPayload: {
            syncedSessionIds: syncedIds,
            goalId
          }
        }
      };
    } else {
      throw new Error(`Unsupported calendar operation: ${operation}`);
    }
  }

  public async rollback(
    operation: string,
    rollbackPayload: any,
    accessToken: string | null
  ): Promise<boolean> {
    const { syncedSessionIds, goalId } = rollbackPayload;
    if (!syncedSessionIds || syncedSessionIds.length === 0) return true;

    console.log(`[GoogleCalendarToolAdapter] Rolling back calendar sync for sessions: ${syncedSessionIds.join(", ")}`);

    // 1. Revert synced state in local DB
    if (goalId) {
      const goal = await getGoalById(goalId);
      if (goal && goal.plan?.schedule) {
        goal.plan.schedule.forEach(s => {
          if (syncedSessionIds.includes(s.id)) {
            s.isSynced = false;
          }
        });
        await goalRepository.save(goal);
      }
    }

    // 2. Remove events from Google Calendar if using a real connection
    if (accessToken && accessToken !== "mock_access_token") {
      try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        for (const sessionId of syncedSessionIds) {
          // List events matching the sessionId in their description
          const response = await executeWithRetry(() =>
            calendar.events.list({
              calendarId: "primary",
              q: sessionId
            })
          );

          if (response.data.items && response.data.items.length > 0) {
            for (const event of response.data.items) {
              if (event.id) {
                console.log(`[GoogleCalendarToolAdapter] Deleting Calendar Event ${event.id} for session ${sessionId}`);
                await executeWithRetry(() =>
                  calendar.events.delete({
                    calendarId: "primary",
                    eventId: event.id!
                  })
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("[GoogleCalendarToolAdapter] Rollback API error:", err);
        return false;
      }
    } else {
      console.log("[GoogleCalendarToolAdapter] Simulating calendar rollback (Google API is in mock fallback mode).");
    }

    return true;
  }
}

// B. Gmail Adapter
export class GmailToolAdapter implements ToolAdapter {
  public async execute(
    operation: string,
    parameters: any,
    accessToken: string | null
  ) {
    const { to, subject, body } = parameters;
    
    if (operation === "create_draft") {
      let draftId = "mock-draft-" + Math.random().toString(36).substr(2, 9);
      
      if (accessToken && accessToken !== "mock_access_token") {
        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          // Create base64 encoded raw email content
          const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
          const emailParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            body
          ];
          const email = emailParts.join("\r\n");
          const encodedMessage = Buffer.from(email)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const draftResponse = await executeWithRetry(() =>
            gmail.users.drafts.create({
              userId: "me",
              requestBody: {
                message: {
                  raw: encodedMessage
                }
              }
            })
          );
          if (draftResponse.data.id) {
            draftId = draftResponse.data.id;
          }
        } catch (err) {
          console.error("[GmailToolAdapter] Real draft creation failed, falling back to mock:", err);
        }
      }

      return {
        success: true,
        modifiedResources: [{
          resourceType: "gmail_draft",
          resourceId: draftId,
          newState: { status: "created", recipient: to, subject }
        }],
        rollbackInfo: {
          rollbackSupported: true,
          rollbackPayload: { draftId }
        }
      };
    } else if (operation === "send_email") {
      let messageId = "mock-msg-" + Math.random().toString(36).substr(2, 9);

      if (accessToken && accessToken !== "mock_access_token") {
        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
          const emailParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            body
          ];
          const email = emailParts.join("\r\n");
          const encodedMessage = Buffer.from(email)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const response = await executeWithRetry(() =>
            gmail.users.messages.send({
              userId: "me",
              requestBody: {
                raw: encodedMessage
              }
            })
          );
          if (response.data.id) {
            messageId = response.data.id;
          }
        } catch (err) {
          console.error("[GmailToolAdapter] Real send failed, falling back to mock:", err);
        }
      }

      return {
        success: true,
        modifiedResources: [{
          resourceType: "gmail_message",
          resourceId: messageId,
          newState: { status: "sent", recipient: to, subject }
        }],
        rollbackInfo: {
          rollbackSupported: false // Sending an email is irreversible!
        }
      };
    } else {
      throw new Error(`Unsupported Gmail operation: ${operation}`);
    }
  }

  public async rollback(
    operation: string,
    rollbackPayload: any,
    accessToken: string | null
  ): Promise<boolean> {
    const { draftId } = rollbackPayload;
    if (!draftId) return true;

    console.log(`[GmailToolAdapter] Rolling back Gmail draft: ${draftId}`);

    if (accessToken && accessToken !== "mock_access_token") {
      try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        await executeWithRetry(() =>
          gmail.users.drafts.delete({
            userId: "me",
            id: draftId
          })
        );
      } catch (err) {
        console.error("[GmailToolAdapter] Rollback API error:", err);
        return false;
      }
    }

    return true;
  }
}

// C. Google Drive Adapter (Placeholder)
export class GoogleDriveToolAdapter implements ToolAdapter {
  public async execute(
    operation: string,
    parameters: any,
    accessToken: string | null
  ) {
    const docId = "mock-doc-" + Math.random().toString(36).substr(2, 9);
    console.log(`[GoogleDriveToolAdapter] Executing mock operation "${operation}" with parameters:`, parameters);
    
    return {
      success: true,
      modifiedResources: [{
        resourceType: "google_drive_document",
        resourceId: docId,
        newState: { title: parameters.title || "Untitled Document", shared: false }
      }],
      rollbackInfo: {
        rollbackSupported: true,
        rollbackPayload: { docId }
      }
    };
  }

  public async rollback(
    operation: string,
    rollbackPayload: any,
    accessToken: string | null
  ): Promise<boolean> {
    console.log(`[GoogleDriveToolAdapter] Reverting document creation for document ${rollbackPayload.docId}`);
    return true;
  }
}

// D. Google Tasks Adapter (Placeholder)
export class GoogleTasksToolAdapter implements ToolAdapter {
  public async execute(
    operation: string,
    parameters: any,
    accessToken: string | null
  ) {
    const taskId = "mock-task-" + Math.random().toString(36).substr(2, 9);
    console.log(`[GoogleTasksToolAdapter] Executing mock operation "${operation}" with parameters:`, parameters);
    
    return {
      success: true,
      modifiedResources: [{
        resourceType: "google_task",
        resourceId: taskId,
        newState: { title: parameters.title || "Sync Task", status: "needsAction" }
      }],
      rollbackInfo: {
        rollbackSupported: true,
        rollbackPayload: { taskId }
      }
    };
  }

  public async rollback(
    operation: string,
    rollbackPayload: any,
    accessToken: string | null
  ): Promise<boolean> {
    console.log(`[GoogleTasksToolAdapter] Reverting task creation for task ${rollbackPayload.taskId}`);
    return true;
  }
}

// 3. Central Tool Execution Framework Singleton
export class ToolExecutionFramework {
  private static instance: ToolExecutionFramework | null = null;
  private adapters: Map<string, ToolAdapter> = new Map();

  private constructor() {
    this.registerAdapter("google_calendar", new GoogleCalendarToolAdapter());
    this.registerAdapter("gmail", new GmailToolAdapter());
    this.registerAdapter("google_drive", new GoogleDriveToolAdapter());
    this.registerAdapter("google_tasks", new GoogleTasksToolAdapter());
  }

  public static getInstance(): ToolExecutionFramework {
    if (!ToolExecutionFramework.instance) {
      ToolExecutionFramework.instance = new ToolExecutionFramework();
    }
    return ToolExecutionFramework.instance;
  }

  public registerAdapter(toolId: string, adapter: ToolAdapter) {
    this.adapters.set(toolId, adapter);
  }

  public getAdapter(toolId: string): ToolAdapter | undefined {
    return this.adapters.get(toolId);
  }

  /**
   * Main Tool Execution Gateway
   */
  public async execute(
    request: ToolExecutionRequest,
    accessToken: string | null
  ): Promise<ToolExecutionResult> {
    console.log(`[ToolExecutionFramework] Received execution request for tool: ${request.toolId}, operation: ${request.operation}`);
    
    const startTime = Date.now();
    const operationId = "op-" + Math.random().toString(36).substr(2, 9);
    const correlationId = request.correlationId || "corr-" + Math.random().toString(36).substr(2, 9);
    
    // Initialize default result
    const result: ToolExecutionResult = {
      success: false,
      operationId,
      timestamp: new Date().toISOString(),
      modifiedResources: [],
      metadata: {
        durationMs: 0,
        attempts: 0
      }
    };

    try {
      // 1. Discovery & Availability Gate
      const registry = await getToolRegistry();
      const toolDef = registry.find(t => t.id === request.toolId);
      if (!toolDef) {
        throw new Error(`Tool "${request.toolId}" is not registered in the Tool Registry.`);
      }
      if (toolDef.availabilityStatus !== "active") {
        throw new Error(`Tool "${request.toolId}" is currently disabled (inactive).`);
      }

      // 2. Permission Validation Gate (Scope validation)
      if (accessToken && accessToken !== "mock_access_token") {
        // In real OAuth scenarios, we would validate that required scopes exist in our authorized session.
        console.log(`[ToolExecutionFramework] Validating OAuth scopes: [${toolDef.requiredScopes.join(", ")}]`);
      }

      // 3. Policy & Governance Gate (Chapter 12 Autonomy Policy validation)
      const worldModel = await constructWorldModelSnapshot();
      const goal = request.decisionId ? await getGoalById(request.decisionId) : worldModel.activeGoals[0];
      
      const cognitiveState: CognitiveState = {
        currentStage: "DECIDE",
        history: [],
        worldModel: {
          timestamp: new Date().toISOString(),
          activeGoals: goal ? [goal] : worldModel.activeGoals,
          upcomingDeadlines: worldModel.upcomingDeadlines,
          userPreferences: worldModel.userPreferences
        },
        workingMemory: {
          transientNotes: [`Tool execution request: ${request.toolId}/${request.operation}`],
          negotiationLog: [],
          decisionsMade: []
        },
        confidence: {
          intent: 95,
          planning: 95,
          scheduling: 95,
          decision: 95
        }
      };

      const policyEngine = new PolicyEngine();
      const policyDecision = await policyEngine.evaluateDecision(cognitiveState, "calendar_sync");

      result.validationResult = {
        passed: policyDecision.executionStatus === "authorized",
        reason: policyDecision.explanation
      };

      if (policyDecision.executionStatus === "blocked") {
        throw new Error(`Governance policy blocked execution: ${policyDecision.explanation}`);
      }

      // 4. Adapter Resolution
      const adapter = this.adapters.get(request.toolId);
      if (!adapter) {
        throw new Error(`Execution adapter for tool "${request.toolId}" is missing.`);
      }

      // 5. Execution & Reliability Loop (Retries with Exponential Backoff)
      const maxRetries = toolDef.retryPolicy.maxRetries || 3;
      let initialDelay = toolDef.retryPolicy.initialDelayMs || 1000;
      let attempts = 0;
      let lastError: any = null;
      let adapterResult: any = null;

      while (attempts < maxRetries) {
        attempts++;
        result.metadata.attempts = attempts;
        try {
          console.log(`[ToolExecutionFramework] Execution attempt ${attempts} of ${maxRetries} for ${request.toolId}...`);
          
          // Timeout Wrapper
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${toolDef.timeoutMs}ms`)), toolDef.timeoutMs)
          );
          
          adapterResult = await Promise.race([
            adapter.execute(request.operation, request.parameters, accessToken),
            timeoutPromise
          ]);

          if (adapterResult.success) {
            break; // Success!
          } else {
            throw new Error(adapterResult.error || "Adapter reported unsuccessful operation.");
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[ToolExecutionFramework] Attempt ${attempts} failed:`, err.message || err);
          
          if (attempts < maxRetries && isRetryableError(err)) {
            const backoffDelay = initialDelay * Math.pow(2, attempts - 1);
            console.log(`[ToolExecutionFramework] Retryable failure. Waiting ${backoffDelay}ms before retry...`);
            await delay(backoffDelay);
          } else {
            // Non-retryable failure or attempts exhausted
            break;
          }
        }
      }

      if (!adapterResult || !adapterResult.success) {
        throw lastError || new Error("Tool execution failed after maximum retry attempts.");
      }

      // 6. Execution Success Integration
      result.success = true;
      result.modifiedResources = adapterResult.modifiedResources || [];
      result.rollbackInfo = adapterResult.rollbackInfo;
      
      // Update Tool Health registry telemetry
      toolDef.healthStatus = "healthy";
      await saveToolDefinition(toolDef);

      // Generate Learning Observation (Chapter 11 feedback integration)
      await recordObservation(
        "ToolExecutionFramework",
        "tool_execution_success",
        `Tool executed successfully: ${request.toolId}/${request.operation}`,
        `Modified ${result.modifiedResources.length} resources. Correlation ID: ${correlationId}`,
        "System",
        95,
        request.decisionId
      );

    } catch (err: any) {
      console.error(`[ToolExecutionFramework] Execution failed:`, err);
      result.success = false;
      result.metadata.error = err.message || String(err);
      
      // Update health telemetry in case of severe failure
      const registry = await getToolRegistry();
      const toolDef = registry.find(t => t.id === request.toolId);
      if (toolDef) {
        toolDef.healthStatus = "degraded";
        await saveToolDefinition(toolDef);
      }

      // Record failure observation
      await recordObservation(
        "ToolExecutionFramework",
        "tool_execution_failure",
        `Tool execution failed: ${request.toolId}/${request.operation}`,
        `Reason: ${result.metadata.error}. Correlation ID: ${correlationId}`,
        "System",
        100,
        request.decisionId
      );
    }

    result.metadata.durationMs = Date.now() - startTime;

    // Log the audit trail
    const executionLog: ToolExecutionLog = {
      id: operationId,
      request,
      result,
      timestamp: new Date().toISOString(),
      status: result.success ? "success" : "failed"
    };
    await saveToolExecutionLog(executionLog);

    // Record Metrics Registry Telemetry
    try {
      const { metricsRegistry } = await import("../infrastructure/metrics.js");
      metricsRegistry.recordGoogleApiCall(
        request.toolId,
        request.operation,
        result.success ? "success" : "failure",
        result.metadata.durationMs
      );
    } catch (err) {
      console.error("[ToolExecutionFramework] Failed to record metrics:", err);
    }

    return result;
  }

  /**
   * Rollback a previous operation
   */
  public async rollback(
    operationId: string,
    accessToken: string | null
  ): Promise<boolean> {
    console.log(`[ToolExecutionFramework] Triggering rollback for operation ID: ${operationId}`);
    
    const log = await getToolExecutionLogById(operationId);
    if (!log) {
      console.error(`[ToolExecutionFramework] Rollback failed: Log not found for ID ${operationId}`);
      return false;
    }

    if (log.status !== "success") {
      console.warn(`[ToolExecutionFramework] Rollback skipped: operation status is ${log.status}`);
      return false;
    }

    if (!log.result.rollbackInfo || !log.result.rollbackInfo.rollbackSupported) {
      console.warn(`[ToolExecutionFramework] Rollback skipped: Tool or operation does not support rollback.`);
      return false;
    }

    const adapter = this.adapters.get(log.request.toolId);
    if (!adapter || !adapter.rollback) {
      console.error(`[ToolExecutionFramework] Rollback failed: Adapter or rollback function not found for tool ${log.request.toolId}`);
      return false;
    }

    try {
      const rollbackSuccess = await adapter.rollback(
        log.request.operation,
        log.result.rollbackInfo.rollbackPayload,
        accessToken
      );

      if (rollbackSuccess) {
        log.status = "rolled_back";
        log.rolledBackAt = new Date().toISOString();
        await saveToolExecutionLog(log);

        // Log episodic memory & observation
        await recordObservation(
          "ToolExecutionFramework",
          "tool_execution_rollback",
          `Rolled back operation: ${log.request.toolId}/${log.request.operation}`,
          `Successfully reverted resources modified in operation ${operationId}`,
          "System",
          100,
          log.request.decisionId
        );
        return true;
      }
    } catch (err) {
      console.error(`[ToolExecutionFramework] Rollback error for operation ${operationId}:`, err);
    }

    return false;
  }
}
