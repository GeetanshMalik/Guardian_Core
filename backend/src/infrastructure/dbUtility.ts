/**
 * Infrastructure CLI Tool: dbUtility (§19.22, §19.25)
 * 
 * Provides CLI commands for:
 * 1. db:backup - exports entire database state (Firestore or local JSON) to a timestamped JSON file.
 * 2. db:restore <path> - restores database state from a backup JSON file.
 * 3. db:migrate - automates refactoring nested legacy goals into independent milestones and tasks.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  getGoals,
  saveGoal,
  getMilestones,
  saveMilestone,
  getTasks,
  saveTask,
  getNotifications,
  saveNotification,
  getJobs,
  saveJob,
  getEpisodicMemories,
  saveEpisodicMemory,
  getSemanticMemories,
  saveSemanticMemory,
  getPreferenceMemories,
  savePreferenceMemory,
  getDecisionMemories,
  saveDecisionMemory,
  getReflectionMemories,
  saveReflectionMemory,
  getObservations,
  saveObservation,
  getAutonomyLevel,
  saveAutonomyLevel,
  getToolRegistry,
  saveToolDefinition,
  getToolExecutionLogs,
  saveToolExecutionLog,
  getResearchPackages,
  saveResearchPackage,
  getAuditLogs,
  saveAuditLog,
} from "../db.js";

// Load environment variables
dotenv.config();

const backupDir = path.join(process.cwd(), "backups");

async function backup() {
  console.log("[dbUtility] Starting database backup...");
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const data = {
    goals: await getGoals(),
    milestones: await getMilestones(),
    tasks: await getTasks(),
    notifications: await getNotifications(),
    jobs: await getJobs(),
    episodicMemories: await getEpisodicMemories(),
    semanticMemories: await getSemanticMemories(),
    preferenceMemories: await getPreferenceMemories(),
    decisionMemories: await getDecisionMemories(),
    reflectionMemories: await getReflectionMemories(),
    observations: await getObservations(),
    autonomyLevel: await getAutonomyLevel(),
    toolRegistry: await getToolRegistry(),
    toolExecutionLogs: await getToolExecutionLogs(),
    researchPackages: await getResearchPackages(),
    auditLogs: await getAuditLogs(),
  };
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
  
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[dbUtility] Backup completed successfully. Saved to: ${backupPath}`);
}

async function restore(backupFilePath: string) {
  console.log(`[dbUtility] Restoring database from: ${backupFilePath}...`);
  if (!fs.existsSync(backupFilePath)) {
    console.error(`[dbUtility] Backup file not found: ${backupFilePath}`);
    process.exit(1);
  }
  
  const raw = fs.readFileSync(backupFilePath, "utf-8");
  const data = JSON.parse(raw);
  
  if (data.goals) {
    console.log(`  Restoring ${data.goals.length} goals...`);
    for (const g of data.goals) await saveGoal(g);
  }
  if (data.milestones) {
    console.log(`  Restoring ${data.milestones.length} milestones...`);
    for (const m of data.milestones) await saveMilestone(m);
  }
  if (data.tasks) {
    console.log(`  Restoring ${data.tasks.length} tasks...`);
    for (const t of data.tasks) await saveTask(t);
  }
  if (data.notifications) {
    console.log(`  Restoring ${data.notifications.length} notifications...`);
    for (const n of data.notifications) await saveNotification(n);
  }
  if (data.jobs) {
    console.log(`  Restoring ${data.jobs.length} jobs...`);
    for (const j of data.jobs) await saveJob(j);
  }
  if (data.episodicMemories) {
    console.log(`  Restoring ${data.episodicMemories.length} episodic memories...`);
    for (const em of data.episodicMemories) await saveEpisodicMemory(em);
  }
  if (data.semanticMemories) {
    console.log(`  Restoring ${data.semanticMemories.length} semantic memories...`);
    for (const sm of data.semanticMemories) await saveSemanticMemory(sm);
  }
  if (data.preferenceMemories) {
    console.log(`  Restoring ${data.preferenceMemories.length} preference memories...`);
    for (const pm of data.preferenceMemories) await savePreferenceMemory(pm);
  }
  if (data.decisionMemories) {
    console.log(`  Restoring ${data.decisionMemories.length} decision memories...`);
    for (const dm of data.decisionMemories) await saveDecisionMemory(dm);
  }
  if (data.reflectionMemories) {
    console.log(`  Restoring ${data.reflectionMemories.length} reflection memories...`);
    for (const rm of data.reflectionMemories) await saveReflectionMemory(rm);
  }
  if (data.observations) {
    console.log(`  Restoring ${data.observations.length} observations...`);
    for (const o of data.observations) await saveObservation(o);
  }
  if (data.autonomyLevel) {
    console.log(`  Restoring autonomy level: ${data.autonomyLevel}`);
    await saveAutonomyLevel(data.autonomyLevel);
  }
  if (data.toolRegistry) {
    console.log(`  Restoring ${data.toolRegistry.length} tool definitions...`);
    for (const tr of data.toolRegistry) await saveToolDefinition(tr);
  }
  if (data.toolExecutionLogs) {
    console.log(`  Restoring ${data.toolExecutionLogs.length} tool logs...`);
    for (const tel of data.toolExecutionLogs) await saveToolExecutionLog(tel);
  }
  if (data.researchPackages) {
    console.log(`  Restoring ${data.researchPackages.length} research packages...`);
    for (const rp of data.researchPackages) await saveResearchPackage(rp);
  }
  if (data.auditLogs) {
    console.log(`  Restoring ${data.auditLogs.length} audit logs...`);
    for (const al of data.auditLogs) await saveAuditLog(al);
  }
  
  console.log("[dbUtility] Restore completed successfully.");
}

async function migrate() {
  console.log("[dbUtility] Starting database schema migration (flattening milestones and tasks)...");
  
  const goals = await getGoals();
  let migratedGoals = 0;
  let migratedMilestones = 0;
  let migratedTasks = 0;
  
  for (const goal of goals) {
    const plan = (goal as any).plan;
    if (!plan) continue;
    
    let hasUpdates = false;
    
    // Migrate milestones
    if (plan.milestones && Array.isArray(plan.milestones)) {
      for (const milestone of plan.milestones) {
        milestone.goalId = goal.id;
        await saveMilestone(milestone);
        migratedMilestones++;
      }
      delete plan.milestones;
      hasUpdates = true;
    }
    
    // Migrate tasks
    if (plan.tasks && Array.isArray(plan.tasks)) {
      for (const task of plan.tasks) {
        task.goalId = goal.id;
        await saveTask(task);
        migratedTasks++;
      }
      delete plan.tasks;
      hasUpdates = true;
    }
    
    if (hasUpdates) {
      await saveGoal(goal);
      migratedGoals++;
    }
  }
  
  console.log(`[dbUtility] Migration completed. Normalized ${migratedGoals} goals, ${migratedMilestones} milestones, and ${migratedTasks} tasks.`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === "backup") {
    await backup();
  } else if (command === "restore") {
    const backupFilePath = args[1];
    if (!backupFilePath) {
      console.error("[dbUtility] Please specify a backup file path: npm run db:restore -- <file-path>");
      process.exit(1);
    }
    await restore(backupFilePath);
  } else if (command === "migrate") {
    await migrate();
  } else {
    console.log("Usage: npm run db:backup | npm run db:restore -- <file-path> | npm run db:migrate");
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[dbUtility] Utility failed:", err);
  process.exit(1);
});
