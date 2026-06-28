interface ApiMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
}

interface CognitiveMetric {
  goalId: string;
  model: string;
  tokensPrompt: number;
  tokensCompletion: number;
  latencyMs: number;
  confidence: number;
  policyChecksPassed: number;
  policyChecksFailed: number;
}

interface WorkerMetric {
  workerName: string;
  status: "completed" | "failed";
  durationMs: number;
  retries: number;
}

interface GoogleApiMetric {
  service: string; // e.g., "calendar", "gmail", "drive"
  operation: string; // e.g., "create_event", "send_email"
  status: "success" | "failure";
  durationMs: number;
}

export class MetricsRegistry {
  private static instance: MetricsRegistry;

  private apiCalls: ApiMetric[] = [];
  private cognitiveCycles: CognitiveMetric[] = [];
  private workerRuns: WorkerMetric[] = [];
  private googleApiCalls: GoogleApiMetric[] = [];

  private activeWebSockets = 0;

  private constructor() {}

  public static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  // --- RECORDING METHODS ---

  public recordApiCall(endpoint: string, method: string, statusCode: number, durationMs: number): void {
    this.apiCalls.push({ endpoint, method, statusCode, durationMs });
    // Cap size to prevent memory growth
    if (this.apiCalls.length > 1000) this.apiCalls.shift();
  }

  public recordCognitiveCycle(metric: CognitiveMetric): void {
    this.cognitiveCycles.push(metric);
    if (this.cognitiveCycles.length > 500) this.cognitiveCycles.shift();
  }

  public recordWorkerRun(workerName: string, status: "completed" | "failed", durationMs: number, retries: number): void {
    this.workerRuns.push({ workerName, status, durationMs, retries });
    if (this.workerRuns.length > 500) this.workerRuns.shift();
  }

  public recordGoogleApiCall(service: string, operation: string, status: "success" | "failure", durationMs: number): void {
    this.googleApiCalls.push({ service, operation, status, durationMs });
    if (this.googleApiCalls.length > 1000) this.googleApiCalls.shift();
  }

  public setWebSocketCount(count: number): void {
    this.activeWebSockets = Math.max(0, count);
  }

  public getWebSocketCount(): number {
    return this.activeWebSockets;
  }

  // --- STATS & SLO CALCULATIONS ---

  public getSummary() {
    const totalApi = this.apiCalls.length;
    const failedApi = this.apiCalls.filter((c) => c.statusCode >= 500).length;
    const apiAvailability = totalApi > 0 ? ((totalApi - failedApi) / totalApi) * 100 : 100;

    const apiLatencies = this.apiCalls.map((c) => c.durationMs);
    const avgApiLatency = apiLatencies.length > 0 
      ? apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length 
      : 0;

    const totalWorkers = this.workerRuns.length;
    const failedWorkers = this.workerRuns.filter((r) => r.status === "failed").length;
    const workerSuccessRate = totalWorkers > 0 ? ((totalWorkers - failedWorkers) / totalWorkers) * 100 : 100;

    const totalCalendarSync = this.googleApiCalls.filter((c) => c.service === "calendar").length;
    const failedCalendarSync = this.googleApiCalls.filter((c) => c.service === "calendar" && c.status === "failure").length;
    const calendarSyncSuccessRate = totalCalendarSync > 0 
      ? ((totalCalendarSync - failedCalendarSync) / totalCalendarSync) * 100 
      : 100;

    const totalNotification = this.googleApiCalls.filter((c) => c.service === "notification" || c.operation === "send_alert").length;
    const failedNotification = this.googleApiCalls.filter((c) => (c.service === "notification" || c.operation === "send_alert") && c.status === "failure").length;
    const notificationSuccessRate = totalNotification > 0 
      ? ((totalNotification - failedNotification) / totalNotification) * 100 
      : 100;

    const cognitiveStats = this.cognitiveCycles.reduce(
      (acc, c) => {
        acc.totalTokens += c.tokensPrompt + c.tokensCompletion;
        acc.avgConfidence += c.confidence;
        acc.avgLatency += c.latencyMs;
        acc.totalCycles++;
        return acc;
      },
      { totalTokens: 0, avgConfidence: 0, avgLatency: 0, totalCycles: 0 }
    );

    if (cognitiveStats.totalCycles > 0) {
      cognitiveStats.avgConfidence /= cognitiveStats.totalCycles;
      cognitiveStats.avgLatency /= cognitiveStats.totalCycles;
    }

    // SLO targets definitions (§24.13)
    const slos = [
      { name: "API Availability", target: 99.9, actual: apiAvailability, unit: "%", passed: apiAvailability >= 99.9 },
      { name: "API Latency (Average)", target: 300, actual: avgApiLatency, unit: "ms", passed: avgApiLatency < 300 },
      { name: "Worker Success Rate", target: 99.0, actual: workerSuccessRate, unit: "%", passed: workerSuccessRate >= 99.0 },
      { name: "Calendar Synchronization Success", target: 99.5, actual: calendarSyncSuccessRate, unit: "%", passed: calendarSyncSuccessRate >= 99.5 },
      { name: "Notification Delivery Success", target: 99.0, actual: notificationSuccessRate, unit: "%", passed: notificationSuccessRate >= 99.0 },
    ];

    return {
      timestamp: new Date().toISOString(),
      activeConnections: {
        webSockets: this.activeWebSockets,
      },
      volumes: {
        apiRequests: totalApi,
        workerExecutions: totalWorkers,
        googleApiInvocations: this.googleApiCalls.length,
        cognitiveReasoningCycles: cognitiveStats.totalCycles,
      },
      aiPerformance: {
        totalTokensConsumed: cognitiveStats.totalTokens,
        averageReasoningDurationMs: Math.round(cognitiveStats.avgLatency),
        averageDecisionConfidenceScore: Math.round(cognitiveStats.avgConfidence),
      },
      serviceLevelObjectives: slos,
      status: slos.every(s => s.passed) ? "HEALTHY" : "DEGRADED",
    };
  }
}

export const metricsRegistry = MetricsRegistry.getInstance();
