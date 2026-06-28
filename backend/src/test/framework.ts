import fs from "fs";
import path from "path";

type TestFn = () => void | Promise<void>;

interface Test {
  name: string;
  fn: TestFn;
}

interface Suite {
  name: string;
  tests: Test[];
  beforeEachHooks: TestFn[];
  afterEachHooks: TestFn[];
}

export const suites: Suite[] = [];
let currentSuite: Suite | null = null;

export function describe(name: string, fn: () => void) {
  const suite: Suite = { name, tests: [], beforeEachHooks: [], afterEachHooks: [] };
  suites.push(suite);
  
  const prevSuite = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prevSuite;
}

export function it(name: string, fn: TestFn) {
  if (!currentSuite) {
    throw new Error(`"it" must be called inside a "describe" block.`);
  }
  currentSuite.tests.push({ name, fn });
}

export function beforeEach(fn: TestFn) {
  if (!currentSuite) {
    throw new Error(`"beforeEach" must be called inside a "describe" block.`);
  }
  currentSuite.beforeEachHooks.push(fn);
}

export function afterEach(fn: TestFn) {
  if (!currentSuite) {
    throw new Error(`"afterEach" must be called inside a "describe" block.`);
  }
  currentSuite.afterEachHooks.push(fn);
}

// Custom Assertions
export const expect = (actual: any) => {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: any) {
      const actStr = JSON.stringify(actual);
      const expStr = JSON.stringify(expected);
      if (actStr !== expStr) {
        throw new Error(`Expected ${actStr} to equal ${expStr}`);
      }
    },
    toExist() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to exist, but got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toContain(substring: string) {
      if (typeof actual !== "string" || !actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    toThrow(expectedMessage?: string) {
      if (typeof actual !== "function") {
        throw new Error("expect() argument must be a function to check throwing.");
      }
      try {
        actual();
      } catch (err: any) {
        if (expectedMessage && !err.message.includes(expectedMessage)) {
          throw new Error(`Expected function to throw error containing "${expectedMessage}", but got "${err.message}"`);
        }
        return;
      }
      throw new Error("Expected function to throw, but it succeeded.");
    },
    async toReject(expectedMessage?: string) {
      try {
        await actual;
      } catch (err: any) {
        if (expectedMessage && !err.message.includes(expectedMessage)) {
          throw new Error(`Expected promise to reject with error containing "${expectedMessage}", but got "${err.message}"`);
        }
        return;
      }
      throw new Error("Expected promise to reject, but it resolved successfully.");
    }
  };
};

// Database Reset helper
const dbDir = path.join(process.cwd(), "backend", "src", "db");
const dbPath = path.join(dbDir, "db.json");

export async function resetDatabase() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const defaultData = {
    goals: [],
    notifications: [
      {
        id: "n-init",
        type: "success",
        title: "Guardian Sentinel Online",
        message: "The Guardian Core agent-mesh is fully synchronized and actively monitoring your roadmap.",
        createdAt: new Date().toISOString(),
        isRead: false
      }
    ],
    jobs: [],
    episodicMemories: [],
    semanticMemories: [],
    preferenceMemories: [],
    decisionMemories: [],
    reflectionMemories: [],
    observations: [],
    autonomyLevel: "assisted",
    toolRegistry: [
      {
        id: "google_calendar",
        name: "Google Calendar",
        operations: ["create_event", "update_event", "delete_event", "list_events"],
        requiredScopes: ["https://www.googleapis.com/auth/calendar.events"],
        availabilityStatus: "active",
        healthStatus: "healthy",
        retryPolicy: { maxRetries: 3, initialDelayMs: 1000 },
        timeoutMs: 10000,
        rollbackSupported: true
      },
      {
        id: "gmail",
        name: "Gmail Integration",
        operations: ["create_draft", "send_email"],
        requiredScopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.compose"],
        availabilityStatus: "active",
        healthStatus: "healthy",
        retryPolicy: { maxRetries: 3, initialDelayMs: 1000 },
        timeoutMs: 10000,
        rollbackSupported: false
      }
    ],
    toolExecutionLogs: [],
    researchPackages: [],
    milestones: [],
    tasks: [],
    auditLogs: [],
    deadLetterEvents: [],
    processedEvents: [],
    eventStore: [],
    apiIdempotency: []
  };

  await fs.promises.writeFile(dbPath, JSON.stringify(defaultData, null, 2), "utf-8");
}
