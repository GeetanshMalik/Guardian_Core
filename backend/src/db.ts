import fs from "fs";
import path from "path";
import { Firestore } from "@google-cloud/firestore";
import { Goal, SystemNotification, AgentJob, EpisodicMemory, SemanticMemory, PreferenceMemory, DecisionMemory, ReflectionMemory, Observation, AutonomyLevel, ToolDefinition, ToolExecutionLog, ResearchPackage, Milestone, Task, AuditLog, DeadLetterEvent, ProcessedEvent, EventStoreEntry, IdempotencyEntry } from "./types.js";

const dbDir = path.join(process.cwd(), "backend", "src", "db");
const dbPath = path.join(dbDir, "db.json");

interface DatabaseSchema {
  goals: Goal[];
  notifications: SystemNotification[];
  jobs: AgentJob[];
  episodicMemories?: EpisodicMemory[];
  semanticMemories?: SemanticMemory[];
  preferenceMemories?: PreferenceMemory[];
  decisionMemories?: DecisionMemory[];
  reflectionMemories?: ReflectionMemory[];
  observations?: Observation[];
  autonomyLevel?: AutonomyLevel;
  toolRegistry?: ToolDefinition[];
  toolExecutionLogs?: ToolExecutionLog[];
  researchPackages?: ResearchPackage[];
  milestones?: Milestone[];
  tasks?: Task[];
  auditLogs?: AuditLog[];
  deadLetterEvents?: DeadLetterEvent[];
  processedEvents?: ProcessedEvent[];
  eventStore?: EventStoreEntry[];
  apiIdempotency?: IdempotencyEntry[];
}

let firestore: Firestore | null = null;

// Helper to wrap promises with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database operation timed out")), timeoutMs)
    )
  ]);
}

// Initialize Firestore lazily if credentials are provided
function getFirestore(): Firestore | null {
  if (process.env.NODE_ENV === "test" || process.env.MOCK_GEMINI === "true") {
    return null;
  }
  if (firestore === null) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const hasFirebaseConfig = fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json"));
    const hasKeyFile = !!process.env.FIRESTORE_KEY_FILE && fs.existsSync(process.env.FIRESTORE_KEY_FILE);
    const isExplicitlyEnabled = process.env.ENABLE_FIRESTORE === "true";

    if (projectId && (hasFirebaseConfig || hasKeyFile || isExplicitlyEnabled)) {
      try {
        console.log(`Initializing Firestore for project: ${projectId}`);
        const config: any = { 
          projectId,
          ignoreUndefinedProperties: true 
        };
        if (process.env.FIRESTORE_DATABASE_ID) {
          config.databaseId = process.env.FIRESTORE_DATABASE_ID;
        }
        if (hasKeyFile) {
          config.keyFilename = process.env.FIRESTORE_KEY_FILE;
        }
        firestore = new Firestore(config);
      } catch (err) {
        console.error("Failed to initialize Firestore, falling back to local database:", err);
        firestore = null;
      }
    } else {
      if (projectId) {
        console.log("GCP environment detected but Firestore is not explicitly configured or enabled. Using local JSON database.");
      }
    }
  }
  return firestore;
}

function getDefaultToolRegistry(): ToolDefinition[] {
  return [
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
    },
    {
      id: "google_drive",
      name: "Google Drive Docs",
      operations: ["create_document", "share_document"],
      requiredScopes: ["https://www.googleapis.com/auth/drive.file"],
      availabilityStatus: "inactive",
      healthStatus: "healthy",
      retryPolicy: { maxRetries: 2, initialDelayMs: 2000 },
      timeoutMs: 15000,
      rollbackSupported: true
    },
    {
      id: "google_tasks",
      name: "Google Tasks Manager",
      operations: ["create_task", "complete_task"],
      requiredScopes: ["https://www.googleapis.com/auth/tasks"],
      availabilityStatus: "active",
      healthStatus: "healthy",
      retryPolicy: { maxRetries: 3, initialDelayMs: 1000 },
      timeoutMs: 8000,
      rollbackSupported: true
    }
  ];
}

export function initDb() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    const defaultData: DatabaseSchema = {
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
      toolRegistry: getDefaultToolRegistry(),
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
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), "utf-8");
  }
}

let dbPromiseChain: Promise<any> = Promise.resolve();

async function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = () => operation();
  const resultPromise = dbPromiseChain.then(next);
  dbPromiseChain = resultPromise.catch(() => {});
  return resultPromise;
}

// Local helper to read JSON database asynchronously
async function readLocalDb(): Promise<DatabaseSchema> {
  return runSerialized(async () => {
    initDb();
    try {
      const data = await fs.promises.readFile(dbPath, "utf-8");
      if (!data || data.trim() === "") {
        throw new SyntaxError("Local database file is empty");
      }
      const parsed = JSON.parse(data);
      return {
        goals: parsed.goals || [],
        notifications: parsed.notifications || [],
        jobs: parsed.jobs || [],
        episodicMemories: parsed.episodicMemories || [],
        semanticMemories: parsed.semanticMemories || [],
        preferenceMemories: parsed.preferenceMemories || [],
        decisionMemories: parsed.decisionMemories || [],
        reflectionMemories: parsed.reflectionMemories || [],
        observations: parsed.observations || [],
        autonomyLevel: parsed.autonomyLevel || "assisted",
        toolRegistry: parsed.toolRegistry || getDefaultToolRegistry(),
        toolExecutionLogs: parsed.toolExecutionLogs || [],
        researchPackages: parsed.researchPackages || [],
        milestones: parsed.milestones || [],
        tasks: parsed.tasks || [],
        auditLogs: parsed.auditLogs || [],
        deadLetterEvents: parsed.deadLetterEvents || [],
        processedEvents: parsed.processedEvents || [],
        eventStore: parsed.eventStore || [],
        apiIdempotency: parsed.apiIdempotency || []
      };
    } catch (err) {
      console.error("Failed to read local database, returning default:", err);
      return {
        goals: [],
        notifications: [],
        jobs: [],
        episodicMemories: [],
        semanticMemories: [],
        preferenceMemories: [],
        decisionMemories: [],
        reflectionMemories: [],
        observations: [],
        autonomyLevel: "assisted",
        toolRegistry: getDefaultToolRegistry(),
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
    }
  });
}

// Local helper to write JSON database asynchronously
async function writeLocalDb(data: DatabaseSchema): Promise<void> {
  return runSerialized(async () => {
    initDb();
    await fs.promises.writeFile(dbPath, JSON.stringify(data, null, 2), "utf-8");
  });
}

// --- PUBLIC ASYNC DATABASE API ---

export async function getGoals(): Promise<Goal[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("goals").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal));
    } catch (err) {
      console.error("Firestore getGoals failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.goals;
}

export async function getGoalById(id: string): Promise<Goal | undefined> {
  const db = getFirestore();
  if (db) {
    try {
      const doc = await withTimeout(db.collection("goals").doc(id).get(), 1500);
      if (doc.exists) {
        return { id: doc.id, ...doc.data() } as Goal;
      }
      return undefined;
    } catch (err) {
      console.error(`Firestore getGoalById ${id} failed, falling back:`, err);
    }
  }
  const goals = await getGoals();
  return goals.find(g => g.id === id);
}

export async function saveGoal(goal: Goal): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("goals").doc(goal.id).set(goal, { merge: true }), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveGoal failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  const index = local.goals.findIndex(g => g.id === goal.id);
  if (index !== -1) {
    local.goals[index] = goal;
  } else {
    local.goals.push(goal);
  }
  await writeLocalDb(local);
}

export async function deleteGoal(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      const batch = db.batch();
      
      // Delete the goal itself
      batch.delete(db.collection("goals").doc(id));
      
      // Query and delete related notifications
      const notifsSnapshot = await withTimeout(db.collection("notifications").where("goalId", "==", id).get(), 1500);
      notifsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Query and delete related jobs
      const jobsSnapshot = await withTimeout(db.collection("jobs").where("goalId", "==", id).get(), 1500);
      jobsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Query and delete related milestones
      const milestonesSnapshot = await withTimeout(db.collection("milestones").where("goalId", "==", id).get(), 1500);
      milestonesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Query and delete related tasks
      const tasksSnapshot = await withTimeout(db.collection("tasks").where("goalId", "==", id).get(), 1500);
      tasksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Query and delete related research packages
      const researchSnapshot = await withTimeout(db.collection("researchPackages").where("goalId", "==", id).get(), 1500);
      researchSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      await withTimeout(batch.commit(), 1500);
      return;
    } catch (err) {
      console.error("Firestore deleteGoal batch transaction failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.goals = local.goals.filter(g => g.id !== id);
  local.notifications = local.notifications.filter(n => n.goalId !== id);
  local.jobs = local.jobs.filter(j => j.goalId !== id);
  local.milestones = (local.milestones || []).filter(m => m.goalId !== id);
  local.tasks = (local.tasks || []).filter(t => t.goalId !== id);
  local.researchPackages = (local.researchPackages || []).filter(p => p.goalId !== id);
  await writeLocalDb(local);
}

export async function getNotifications(): Promise<SystemNotification[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("notifications").orderBy("createdAt", "desc").limit(100).get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemNotification));
    } catch (err) {
      console.error("Firestore getNotifications failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.notifications;
}

export async function saveNotification(notification: SystemNotification): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("notifications").doc(notification.id).set(notification), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveNotification failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.notifications.unshift(notification);
  if (local.notifications.length > 100) {
    local.notifications = local.notifications.slice(0, 100);
  }
  await writeLocalDb(local);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("notifications").doc(id).update({ isRead: true }), 1500);
      return;
    } catch (err) {
      console.error("Firestore markNotificationAsRead failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  const index = local.notifications.findIndex(n => n.id === id);
  if (index !== -1) {
    local.notifications[index].isRead = true;
    await writeLocalDb(local);
  }
}

export async function clearAllNotifications(): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("notifications").get(), 1500);
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await withTimeout(batch.commit(), 1500);
      return;
    } catch (err) {
      console.error("Firestore clearAllNotifications failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.notifications = [];
  await writeLocalDb(local);
}

export async function getJobs(): Promise<AgentJob[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("jobs").orderBy("createdAt", "desc").limit(50).get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgentJob));
    } catch (err) {
      console.error("Firestore getJobs failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.jobs;
}

export async function saveJob(job: AgentJob): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("jobs").doc(job.id).set(job), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveJob failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.jobs.unshift(job);
  if (local.jobs.length > 50) {
    local.jobs = local.jobs.slice(0, 50);
  }
  await writeLocalDb(local);
}

// --- SHARED MEMORY ARCHITECTURE CRUD OPERATIONS ---

export async function getEpisodicMemories(): Promise<EpisodicMemory[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("episodic_memories").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EpisodicMemory));
    } catch (err) {
      console.error("Firestore getEpisodicMemories failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.episodicMemories || [];
}

export async function saveEpisodicMemory(memory: EpisodicMemory): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("episodic_memories").doc(memory.id).set(memory), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveEpisodicMemory failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.episodicMemories) local.episodicMemories = [];
  const index = local.episodicMemories.findIndex(m => m.id === memory.id);
  if (index !== -1) {
    local.episodicMemories[index] = memory;
  } else {
    local.episodicMemories.unshift(memory);
  }
  await writeLocalDb(local);
}

export async function getSemanticMemories(): Promise<SemanticMemory[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("semantic_memories").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SemanticMemory));
    } catch (err) {
      console.error("Firestore getSemanticMemories failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.semanticMemories || [];
}

export async function saveSemanticMemory(memory: SemanticMemory): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("semantic_memories").doc(memory.id).set(memory), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveSemanticMemory failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.semanticMemories) local.semanticMemories = [];
  const index = local.semanticMemories.findIndex(m => m.id === memory.id);
  if (index !== -1) {
    local.semanticMemories[index] = memory;
  } else {
    local.semanticMemories.unshift(memory);
  }
  await writeLocalDb(local);
}

export async function getPreferenceMemories(): Promise<PreferenceMemory[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("preference_memories").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PreferenceMemory));
    } catch (err) {
      console.error("Firestore getPreferenceMemories failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.preferenceMemories || [];
}

export async function savePreferenceMemory(memory: PreferenceMemory): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("preference_memories").doc(memory.id).set(memory), 1500);
      return;
    } catch (err) {
      console.error("Firestore savePreferenceMemory failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.preferenceMemories) local.preferenceMemories = [];
  const index = local.preferenceMemories.findIndex(m => m.id === memory.id);
  if (index !== -1) {
    local.preferenceMemories[index] = memory;
  } else {
    local.preferenceMemories.unshift(memory);
  }
  await writeLocalDb(local);
}

export async function getDecisionMemories(): Promise<DecisionMemory[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("decision_memories").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DecisionMemory));
    } catch (err) {
      console.error("Firestore getDecisionMemories failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.decisionMemories || [];
}

export async function saveDecisionMemory(memory: DecisionMemory): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("decision_memories").doc(memory.id).set(memory), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveDecisionMemory failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.decisionMemories) local.decisionMemories = [];
  const index = local.decisionMemories.findIndex(m => m.id === memory.id);
  if (index !== -1) {
    local.decisionMemories[index] = memory;
  } else {
    local.decisionMemories.unshift(memory);
  }
  await writeLocalDb(local);
}

export async function getReflectionMemories(): Promise<ReflectionMemory[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("reflection_memories").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReflectionMemory));
    } catch (err) {
      console.error("Firestore getReflectionMemories failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.reflectionMemories || [];
}

export async function saveReflectionMemory(memory: ReflectionMemory): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("reflection_memories").doc(memory.id).set(memory), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveReflectionMemory failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.reflectionMemories) local.reflectionMemories = [];
  const index = local.reflectionMemories.findIndex(m => m.id === memory.id);
  if (index !== -1) {
    local.reflectionMemories[index] = memory;
  } else {
    local.reflectionMemories.unshift(memory);
  }
  await writeLocalDb(local);
}

export async function deleteMemory(layer: string, id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      const collectionMap: { [key: string]: string } = {
        episodic: "episodic_memories",
        semantic: "semantic_memories",
        preference: "preference_memories",
        decision: "decision_memories",
        reflection: "reflection_memories"
      };
      const coll = collectionMap[layer];
      if (coll) {
        await withTimeout(db.collection(coll).doc(id).delete(), 1500);
        return;
      }
    } catch (err) {
      console.error(`Firestore deleteMemory ${layer}/${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  if (layer === "episodic") {
    local.episodicMemories = (local.episodicMemories || []).filter(m => m.id !== id);
  } else if (layer === "semantic") {
    local.semanticMemories = (local.semanticMemories || []).filter(m => m.id !== id);
  } else if (layer === "preference") {
    local.preferenceMemories = (local.preferenceMemories || []).filter(m => m.id !== id);
  } else if (layer === "decision") {
    local.decisionMemories = (local.decisionMemories || []).filter(m => m.id !== id);
  } else if (layer === "reflection") {
    local.reflectionMemories = (local.reflectionMemories || []).filter(m => m.id !== id);
  }
  await writeLocalDb(local);
}

export async function resetPersonalization(): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      const batch = db.batch();
      const collections = ["episodic_memories", "semantic_memories", "preference_memories", "decision_memories", "reflection_memories", "observations"];
      for (const coll of collections) {
        const snapshot = await withTimeout(db.collection(coll).get(), 1500);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
      }
      await withTimeout(batch.commit(), 1500);
      return;
    } catch (err) {
      console.error("Firestore resetPersonalization failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.episodicMemories = [];
  local.semanticMemories = [];
  local.preferenceMemories = [];
  local.decisionMemories = [];
  local.reflectionMemories = [];
  local.observations = [];
  await writeLocalDb(local);
}

export async function getObservations(): Promise<Observation[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("observations").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Observation));
    } catch (err) {
      console.error("Firestore getObservations failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.observations || [];
}

export async function saveObservation(observation: Observation): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("observations").doc(observation.id).set(observation), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveObservation failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.observations) local.observations = [];
  const index = local.observations.findIndex(o => o.id === observation.id);
  if (index !== -1) {
    local.observations[index] = observation;
  } else {
    local.observations.unshift(observation);
  }
  await writeLocalDb(local);
}

export async function deleteObservation(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("observations").doc(id).delete(), 1500);
      return;
    } catch (err) {
      console.error(`Firestore deleteObservation ${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  local.observations = (local.observations || []).filter(o => o.id !== id);
  await writeLocalDb(local);
}

export async function getAutonomyLevel(): Promise<AutonomyLevel> {
  const db = getFirestore();
  if (db) {
    try {
      const doc = await withTimeout(db.collection("settings").doc("autonomy").get(), 1500);
      if (doc.exists) {
        return (doc.data()?.value || "assisted") as AutonomyLevel;
      }
    } catch (err) {
      console.error("Firestore getAutonomyLevel failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.autonomyLevel || "assisted";
}

export async function saveAutonomyLevel(level: AutonomyLevel): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("settings").doc("autonomy").set({ value: level }), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveAutonomyLevel failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  local.autonomyLevel = level;
  await writeLocalDb(local);
}

export async function getToolRegistry(): Promise<ToolDefinition[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("toolRegistry").get(), 1500);
      if (snapshot.size > 0) {
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ToolDefinition));
      }
    } catch (err) {
      console.error("Firestore getToolRegistry failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.toolRegistry || getDefaultToolRegistry();
}

export async function saveToolDefinition(tool: ToolDefinition): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("toolRegistry").doc(tool.id).set(tool), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveToolDefinition failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.toolRegistry) local.toolRegistry = getDefaultToolRegistry();
  const index = local.toolRegistry.findIndex(t => t.id === tool.id);
  if (index !== -1) {
    local.toolRegistry[index] = tool;
  } else {
    local.toolRegistry.push(tool);
  }
  await writeLocalDb(local);
}

export async function getToolExecutionLogs(): Promise<ToolExecutionLog[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("toolExecutionLogs").orderBy("timestamp", "desc").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ToolExecutionLog));
    } catch (err) {
      console.error("Firestore getToolExecutionLogs failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.toolExecutionLogs || [];
}

export async function saveToolExecutionLog(log: ToolExecutionLog): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("toolExecutionLogs").doc(log.id).set(log), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveToolExecutionLog failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.toolExecutionLogs) local.toolExecutionLogs = [];
  const index = local.toolExecutionLogs.findIndex(l => l.id === log.id);
  if (index !== -1) {
    local.toolExecutionLogs[index] = log;
  } else {
    local.toolExecutionLogs.unshift(log);
  }
  await writeLocalDb(local);
}

export async function getToolExecutionLogById(id: string): Promise<ToolExecutionLog | undefined> {
  const db = getFirestore();
  if (db) {
    try {
      const doc = await withTimeout(db.collection("toolExecutionLogs").doc(id).get(), 1500);
      if (doc.exists) {
        return { id: doc.id, ...doc.data() } as ToolExecutionLog;
      }
    } catch (err) {
      console.error(`Firestore getToolExecutionLogById ${id} failed, falling back:`, err);
    }
  }
  const logs = await getToolExecutionLogs();
  return logs.find(l => l.id === id);
}

export async function getResearchPackages(): Promise<ResearchPackage[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("researchPackages").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResearchPackage));
    } catch (err) {
      console.error("Firestore getResearchPackages failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.researchPackages || [];
}

export async function getResearchPackagesByGoalId(goalId: string): Promise<ResearchPackage[]> {
  const all = await getResearchPackages();
  return all.filter(p => p.goalId === goalId);
}

export async function saveResearchPackage(pkg: ResearchPackage): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("researchPackages").doc(pkg.id).set(pkg), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveResearchPackage failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.researchPackages) local.researchPackages = [];
  const index = local.researchPackages.findIndex(p => p.id === pkg.id);
  if (index !== -1) {
    local.researchPackages[index] = pkg;
  } else {
    local.researchPackages.unshift(pkg);
  }
  await writeLocalDb(local);
}

export async function deleteResearchPackage(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("researchPackages").doc(id).delete(), 1500);
      return;
    } catch (err) {
      console.error(`Firestore deleteResearchPackage ${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  local.researchPackages = (local.researchPackages || []).filter(p => p.id !== id);
  await writeLocalDb(local);
}

export async function getMilestones(): Promise<Milestone[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("milestones").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Milestone));
    } catch (err) {
      console.error("Firestore getMilestones failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.milestones || [];
}

export async function getMilestonesByGoalId(goalId: string): Promise<Milestone[]> {
  const all = await getMilestones();
  return all.filter(m => m.goalId === goalId);
}

export async function saveMilestone(milestone: Milestone): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("milestones").doc(milestone.id).set(milestone), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveMilestone failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.milestones) local.milestones = [];
  const index = local.milestones.findIndex(m => m.id === milestone.id);
  if (index !== -1) {
    local.milestones[index] = milestone;
  } else {
    local.milestones.unshift(milestone);
  }
  await writeLocalDb(local);
}

export async function deleteMilestone(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("milestones").doc(id).delete(), 1500);
      return;
    } catch (err) {
      console.error(`Firestore deleteMilestone ${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  local.milestones = (local.milestones || []).filter(m => m.id !== id);
  await writeLocalDb(local);
}

export async function getTasks(): Promise<Task[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("tasks").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    } catch (err) {
      console.error("Firestore getTasks failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.tasks || [];
}

export async function getTasksByGoalId(goalId: string): Promise<Task[]> {
  const all = await getTasks();
  return all.filter(t => t.goalId === goalId);
}

export async function saveTask(task: Task): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("tasks").doc(task.id).set(task), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveTask failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.tasks) local.tasks = [];
  const index = local.tasks.findIndex(t => t.id === task.id);
  if (index !== -1) {
    local.tasks[index] = task;
  } else {
    local.tasks.unshift(task);
  }
  await writeLocalDb(local);
}

export async function deleteTask(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("tasks").doc(id).delete(), 1500);
      return;
    } catch (err) {
      console.error(`Firestore deleteTask ${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  local.tasks = (local.tasks || []).filter(t => t.id !== id);
  await writeLocalDb(local);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("auditLogs").orderBy("timestamp", "desc").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
    } catch (err) {
      console.error("Firestore getAuditLogs failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.auditLogs || [];
}

export async function saveAuditLog(log: AuditLog): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("auditLogs").doc(log.id).set(log), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveAuditLog failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.auditLogs) local.auditLogs = [];
  const index = local.auditLogs.findIndex(l => l.id === log.id);
  if (index !== -1) {
    local.auditLogs[index] = log;
  } else {
    local.auditLogs.unshift(log);
  }
  await writeLocalDb(local);
}

// --- EVENT-DRIVEN ARCHITECTURE PERSISTENCE ---

export async function getDeadLetterEvents(): Promise<DeadLetterEvent[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("deadLetterEvents").orderBy("timestamp", "desc").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DeadLetterEvent));
    } catch (err) {
      console.error("Firestore getDeadLetterEvents failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.deadLetterEvents || [];
}

export async function saveDeadLetterEvent(event: DeadLetterEvent): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("deadLetterEvents").doc(event.id).set(event), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveDeadLetterEvent failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.deadLetterEvents) local.deadLetterEvents = [];
  const index = local.deadLetterEvents.findIndex(e => e.id === event.id);
  if (index !== -1) {
    local.deadLetterEvents[index] = event;
  } else {
    local.deadLetterEvents.push(event);
  }
  await writeLocalDb(local);
}

export async function deleteDeadLetterEvent(id: string): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("deadLetterEvents").doc(id).delete(), 1500);
      return;
    } catch (err) {
      console.error(`Firestore deleteDeadLetterEvent ${id} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  local.deadLetterEvents = (local.deadLetterEvents || []).filter(e => e.id !== id);
  await writeLocalDb(local);
}

export async function getProcessedEvents(): Promise<ProcessedEvent[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("processedEvents").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessedEvent));
    } catch (err) {
      console.error("Firestore getProcessedEvents failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.processedEvents || [];
}

export async function saveProcessedEvent(event: ProcessedEvent): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("processedEvents").doc(event.id).set(event), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveProcessedEvent failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.processedEvents) local.processedEvents = [];
  const index = local.processedEvents.findIndex(e => e.id === event.id);
  if (index !== -1) {
    local.processedEvents[index] = event;
  } else {
    local.processedEvents.push(event);
  }
  await writeLocalDb(local);
}

export async function getEventStore(): Promise<EventStoreEntry[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("eventStore").orderBy("timestamp", "asc").get(), 1500);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventStoreEntry));
    } catch (err) {
      console.error("Firestore getEventStore failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  return local.eventStore || [];
}

export async function getEventStoreEntryById(id: string): Promise<EventStoreEntry | undefined> {
  const db = getFirestore();
  if (db) {
    try {
      const doc = await withTimeout(db.collection("eventStore").doc(id).get(), 1500);
      if (doc.exists) {
        return { id: doc.id, ...doc.data() } as EventStoreEntry;
      }
    } catch (err) {
      console.error(`Firestore getEventStoreEntryById ${id} failed, falling back:`, err);
    }
  }
  const all = await getEventStore();
  return all.find(e => e.id === id);
}

export async function saveEventStoreEntry(entry: EventStoreEntry): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("eventStore").doc(entry.id).set(entry), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveEventStoreEntry failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.eventStore) local.eventStore = [];
  const index = local.eventStore.findIndex(e => e.id === entry.id);
  if (index !== -1) {
    local.eventStore[index] = entry;
  } else {
    local.eventStore.push(entry);
  }
  if (local.eventStore.length > 100) {
    local.eventStore = local.eventStore.slice(-100);
  }
  await writeLocalDb(local);
}

export async function getIdempotencyEntry(key: string): Promise<IdempotencyEntry | undefined> {
  const db = getFirestore();
  if (db) {
    try {
      const doc = await withTimeout(db.collection("apiIdempotency").doc(key).get(), 1500);
      if (doc.exists) {
        return doc.data() as IdempotencyEntry;
      }
      return undefined;
    } catch (err) {
      console.error(`Firestore getIdempotencyEntry ${key} failed, falling back:`, err);
    }
  }
  const local = await readLocalDb();
  return (local.apiIdempotency || []).find(e => e.id === key);
}

export async function saveIdempotencyEntry(entry: IdempotencyEntry): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await withTimeout(db.collection("apiIdempotency").doc(entry.id).set(entry), 1500);
      return;
    } catch (err) {
      console.error("Firestore saveIdempotencyEntry failed, falling back:", err);
    }
  }
  const local = await readLocalDb();
  if (!local.apiIdempotency) local.apiIdempotency = [];
  const index = local.apiIdempotency.findIndex(e => e.id === entry.id);
  if (index !== -1) {
    local.apiIdempotency[index] = entry;
  } else {
    local.apiIdempotency.push(entry);
  }
  // Cap local idempotency history to 200 entries to prevent infinite growth
  if (local.apiIdempotency.length > 200) {
    local.apiIdempotency = local.apiIdempotency.slice(-200);
  }
  await writeLocalDb(local);
}

export function setFirestoreClientForTesting(client: any): void {
  firestore = client;
}




