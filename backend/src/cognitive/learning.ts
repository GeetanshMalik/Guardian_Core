import {
  saveObservation,
  getObservations,
  getPreferenceMemories,
  savePreferenceMemory,
  deleteMemory
} from "../db.js";
import { Observation, PreferenceMemory } from "../types.js";

/**
 * Standard observation logger wrapper.
 */
export async function recordObservation(
  capability: string,
  action: string,
  outcome: string,
  evidence: string,
  source: string,
  confidence: number,
  goalId?: string,
  userFeedback: "none" | "up" | "down" = "none",
  contextSnapshot?: string
): Promise<Observation> {
  const observation: Observation = {
    id: "obs-" + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    capability,
    goalId,
    action,
    outcome,
    evidence,
    source,
    confidence,
    userFeedback,
    contextSnapshot
  };
  await saveObservation(observation);
  console.log(`[LearningEngine] [OBSERVATION]: Captured "${action}" via ${capability} (${outcome})`);
  return observation;
}

/**
 * Analyzes the accumulated observation log to adjust preferences dynamically.
 * Implements Objectives 2, 3, and 5: Pattern Discovery, Validation, and Explainability.
 */
export async function analyzePatternsAndRefinePreferences(): Promise<void> {
  console.log("[LearningEngine] Initiating pattern analysis and preference promotion checks...");
  const observations = await getObservations();
  const preferences = await getPreferenceMemories();

  // Helper to find or initialize a preference structure
  const getOrCreatePreference = (
    key: string,
    defaultValue: string,
    desc: string
  ): PreferenceMemory => {
    const existing = preferences.find((p) => p.preferenceKey === key);
    if (existing) return existing;
    return {
      id: "pref-" + key,
      preferenceKey: key,
      value: defaultValue,
      confidence: 50, // Initial hypothesis confidence
      evidenceCount: 0,
      source: "Learning Engine",
      lastUpdated: new Date().toISOString(),
      version: 1,
      status: "hypothesis"
    };
  };

  // 1. Analyze Evening Shift Observations
  // Action: "calendar_shift_evening", "evening_session_success"
  const eveningShifts = observations.filter(
    (o) => o.action === "calendar_shift_evening" || o.action === "evening_session"
  );
  if (eveningShifts.length > 0) {
    const pref = getOrCreatePreference("preferredStudyWindow", "19:00 - 21:00", "Preferred Study Focus Window");
    pref.evidenceCount += eveningShifts.length;
    // Increase confidence based on evidence count
    pref.confidence = Math.min(100, pref.confidence + eveningShifts.length * 8);
    pref.lastUpdated = new Date().toISOString();
    pref.version += 1;

    // Promotion validation (Objective 3)
    if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
      pref.status = "promoted";
      pref.value = "19:00 - 21:00";
      console.log(`[LearningEngine] [PROMOTION]: Promoted Evening Study Window to active Preference (${pref.confidence}% confidence).`);
    } else {
      pref.status = "hypothesis";
    }
    await savePreferenceMemory(pref);
  }

  // 2. Analyze Avoid Mornings Shifts
  // Action: "calendar_shift_away_from_morning"
  const morningShifts = observations.filter(
    (o) => o.action === "calendar_shift_away_from_morning"
  );
  if (morningShifts.length > 0) {
    const pref = getOrCreatePreference("avoidMornings", "true", "Avoid morning calendar scheduling");
    pref.evidenceCount += morningShifts.length;
    pref.confidence = Math.min(100, pref.confidence + morningShifts.length * 10);
    pref.lastUpdated = new Date().toISOString();
    pref.version += 1;

    if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
      pref.status = "promoted";
      pref.value = "true";
      console.log(`[LearningEngine] [PROMOTION]: Promoted avoidMornings to active Preference (${pref.confidence}% confidence).`);
    } else {
      pref.status = "hypothesis";
    }
    await savePreferenceMemory(pref);
  }

  // 3. Analyze Avoid Weekends Shifts
  // Action: "calendar_shift_away_from_weekend"
  const weekendShifts = observations.filter(
    (o) => o.action === "calendar_shift_away_from_weekend"
  );
  if (weekendShifts.length > 0) {
    const pref = getOrCreatePreference("avoidWeekends", "true", "Avoid weekend calendar scheduling");
    pref.evidenceCount += weekendShifts.length;
    pref.confidence = Math.min(100, pref.confidence + weekendShifts.length * 10);
    pref.lastUpdated = new Date().toISOString();
    pref.version += 1;

    if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
      pref.status = "promoted";
      pref.value = "true";
      console.log(`[LearningEngine] [PROMOTION]: Promoted avoidWeekends to active Preference (${pref.confidence}% confidence).`);
    } else {
      pref.status = "hypothesis";
    }
    await savePreferenceMemory(pref);
  }

  // 4. Analyze Ignored Evening Sessions
  // Action: "session_ignored"
  const ignoredEveningSessions = observations.filter(
    (o) => o.action === "session_ignored" && o.evidence.toLowerCase().includes("evening")
  );
  if (ignoredEveningSessions.length > 0) {
    const pref = getOrCreatePreference("avoidEvenings", "true", "Avoid evening calendar scheduling");
    pref.evidenceCount += ignoredEveningSessions.length;
    pref.confidence = Math.min(100, pref.confidence + ignoredEveningSessions.length * 12);
    pref.lastUpdated = new Date().toISOString();
    pref.version += 1;

    if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
      pref.status = "promoted";
      pref.value = "true";
      console.log(`[LearningEngine] [PROMOTION]: Promoted avoidEvenings to active Preference (${pref.confidence}% confidence).`);
    } else {
      pref.status = "hypothesis";
    }
    await savePreferenceMemory(pref);
  }

  // 5. Analyze Estimation Adjustments
  // Action: "session_completed_early", "session_overran"
  const earlyCompletions = observations.filter((o) => o.action === "session_completed_early");
  const overruns = observations.filter((o) => o.action === "session_overran");

  if (earlyCompletions.length > 0 || overruns.length > 0) {
    const pref = getOrCreatePreference("estimateAdjustmentFactor", "1.0", "Task duration estimation adjustment factor");
    pref.evidenceCount += earlyCompletions.length + overruns.length;
    
    // Calculate new factor hypothesis
    let currentFactor = parseFloat(pref.value);
    if (earlyCompletions.length > overruns.length) {
      currentFactor = Math.max(0.5, currentFactor - 0.05 * (earlyCompletions.length - overruns.length));
    } else if (overruns.length > earlyCompletions.length) {
      currentFactor = Math.min(2.0, currentFactor + 0.05 * (overruns.length - earlyCompletions.length));
    }
    
    pref.confidence = Math.min(100, pref.confidence + (earlyCompletions.length + overruns.length) * 5);
    pref.lastUpdated = new Date().toISOString();
    pref.version += 1;

    if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
      pref.status = "promoted";
      pref.value = currentFactor.toFixed(2);
      console.log(`[LearningEngine] [PROMOTION]: Promoted estimateAdjustmentFactor to active Preference (${pref.value}, ${pref.confidence}% confidence).`);
    } else {
      pref.status = "hypothesis";
    }
    await savePreferenceMemory(pref);
  }

  // 6. Analyze Task Postponement Patterns
  // Action: "task_postponed" — learn which days users tend to postpone tasks
  const postponements = observations.filter((o) => o.action === "task_postponed");
  if (postponements.length > 0) {
    // Analyze if postponements cluster on specific days of the week
    const dayOfWeekCounts: Record<string, number> = {};
    for (const obs of postponements) {
      try {
        const date = new Date(obs.timestamp);
        const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
        dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;
      } catch { /* skip invalid dates */ }
    }

    // If a specific day has 3+ postponements, suggest avoiding scheduling on that day
    for (const [day, count] of Object.entries(dayOfWeekCounts)) {
      if (count >= 3) {
        const prefKey = `avoid${day}`;
        const pref = getOrCreatePreference(prefKey, "true", `Avoid scheduling on ${day}`);
        pref.evidenceCount += count;
        pref.confidence = Math.min(100, pref.confidence + count * 10);
        pref.lastUpdated = new Date().toISOString();
        pref.version += 1;

        if (pref.confidence >= 75 && pref.evidenceCount >= 3) {
          pref.status = "promoted";
          console.log(`[LearningEngine] [PROMOTION]: User frequently postpones tasks on ${day}. Promoted avoid${day} preference (${pref.confidence}% confidence).`);
        }
        await savePreferenceMemory(pref);
      }
    }
  }

  // 7. Analyze Ignored Reminder Patterns
  // Action: "reminder_ignored" — learn which time windows users ignore reminders
  const ignoredReminders = observations.filter((o) => o.action === "reminder_ignored");
  if (ignoredReminders.length > 0) {
    // Extract hour patterns from ignored reminders
    const hourCounts: Record<number, number> = {};
    for (const obs of ignoredReminders) {
      try {
        const hour = new Date(obs.timestamp).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch { /* skip */ }
    }

    // If mornings (6-9) or late nights (22-23) get ignored, update preferences
    const morningIgnores = [6, 7, 8, 9].reduce((sum, h) => sum + (hourCounts[h] || 0), 0);
    const lateNightIgnores = [22, 23].reduce((sum, h) => sum + (hourCounts[h] || 0), 0);

    if (morningIgnores >= 3) {
      const pref = getOrCreatePreference("avoidMorningReminders", "true", "Avoid sending reminders in the morning");
      pref.evidenceCount += morningIgnores;
      pref.confidence = Math.min(100, pref.confidence + morningIgnores * 8);
      pref.lastUpdated = new Date().toISOString();
      pref.version += 1;
      if (pref.confidence >= 75) {
        pref.status = "promoted";
        console.log(`[LearningEngine] [PROMOTION]: User ignores morning reminders. Promoted avoidMorningReminders (${pref.confidence}% confidence).`);
      }
      await savePreferenceMemory(pref);
    }

    if (lateNightIgnores >= 3) {
      const pref = getOrCreatePreference("avoidLateNightReminders", "true", "Avoid sending reminders late at night");
      pref.evidenceCount += lateNightIgnores;
      pref.confidence = Math.min(100, pref.confidence + lateNightIgnores * 8);
      pref.lastUpdated = new Date().toISOString();
      pref.version += 1;
      if (pref.confidence >= 75) {
        pref.status = "promoted";
        console.log(`[LearningEngine] [PROMOTION]: User ignores late-night reminders. Promoted avoidLateNightReminders (${pref.confidence}% confidence).`);
      }
      await savePreferenceMemory(pref);
    }
  }

  // 8. Analyze Rescheduling Patterns
  // Action: "task_rescheduled" — detect when users consistently move tasks between time periods
  const reschedules = observations.filter((o) => o.action === "task_rescheduled");
  if (reschedules.length >= 2) {
    // Check if user consistently moves tasks from morning → afternoon/evening
    const morningToLater = reschedules.filter((o) => {
      const evidence = o.evidence.toLowerCase();
      return evidence.includes("morning") && (evidence.includes("evening") || evidence.includes("afternoon"));
    });

    if (morningToLater.length >= 2) {
      const pref = getOrCreatePreference("avoidMornings", "true", "Avoid morning calendar scheduling");
      pref.evidenceCount += morningToLater.length;
      pref.confidence = Math.min(100, pref.confidence + morningToLater.length * 12);
      pref.lastUpdated = new Date().toISOString();
      pref.version += 1;
      if (pref.confidence >= 75 && pref.evidenceCount >= 2) {
        pref.status = "promoted";
        pref.value = "true";
        console.log(`[LearningEngine] [PROMOTION]: User consistently reschedules morning tasks to later. Strengthened avoidMornings preference (${pref.confidence}% confidence).`);
      }
      await savePreferenceMemory(pref);
    }
  }
}

/**
 * Decays confidence scores of preferences gradually over time (Section 11.14).
 * Runs periodically inside background worker consolidation loops.
 */
export async function decayConfidenceScores(): Promise<void> {
  console.log("[LearningEngine] Simulating behavioral drift time-decay on personalization preferences...");
  const preferences = await getPreferenceMemories();
  for (const pref of preferences) {
    // Only decay preferences learned dynamically (skip initial system defaults config)
    if (pref.source === "Learning Engine") {
      const oldConfidence = pref.confidence;
      // Decay by 5 points, down to a lower bound of 45%
      pref.confidence = Math.max(45, pref.confidence - 5);
      pref.lastUpdated = new Date().toISOString();
      
      // Demote if confidence drops below threshold
      if (pref.confidence < 75 && pref.status === "promoted") {
        pref.status = "hypothesis";
        console.log(`[LearningEngine] [DEMOTION]: Demoted preference "${pref.preferenceKey}" back to hypothesis due to confidence decay (${oldConfidence}% -> ${pref.confidence}%).`);
      }
      await savePreferenceMemory(pref);
    }
  }
}
