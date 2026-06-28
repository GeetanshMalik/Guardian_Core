import { getGoals, getPreferenceMemories, savePreferenceMemory } from "../db.js";
import { WorldModelSnapshot } from "./types.js";
import { PreferenceMemory } from "../types.js";

export async function constructWorldModelSnapshot(): Promise<WorldModelSnapshot> {
  const goals = await getGoals();
  const activeGoals = goals.filter((g) => g.status === "active");

  const upcomingDeadlines = activeGoals.map((g) => ({
    goalId: g.id,
    title: g.title,
    date: g.deadline,
  }));

  // Fetch preferences from shared memory database
  let prefs = await getPreferenceMemories();
  if (prefs.length === 0) {
    const defaultPrefs: PreferenceMemory[] = [
      {
        id: "pref-work-start",
        preferenceKey: "workHoursStart",
        value: "09:00",
        confidence: 100,
        evidenceCount: 1,
        source: "System Defaults",
        lastUpdated: new Date().toISOString(),
        version: 1,
        status: "promoted"
      },
      {
        id: "pref-work-end",
        preferenceKey: "workHoursEnd",
        value: "22:00",
        confidence: 100,
        evidenceCount: 1,
        source: "System Defaults",
        lastUpdated: new Date().toISOString(),
        version: 1,
        status: "promoted"
      },
      {
        id: "pref-session-mins",
        preferenceKey: "preferredSessionMinutes",
        value: "60",
        confidence: 100,
        evidenceCount: 1,
        source: "System Defaults",
        lastUpdated: new Date().toISOString(),
        version: 1,
        status: "promoted"
      },
      {
        id: "pref-avoid-mornings",
        preferenceKey: "avoidMornings",
        value: "false",
        confidence: 100,
        evidenceCount: 1,
        source: "System Defaults",
        lastUpdated: new Date().toISOString(),
        version: 1,
        status: "promoted"
      },
      {
        id: "pref-avoid-weekends",
        preferenceKey: "avoidWeekends",
        value: "false",
        confidence: 100,
        evidenceCount: 1,
        source: "System Defaults",
        lastUpdated: new Date().toISOString(),
        version: 1,
        status: "promoted"
      }
    ];
    for (const p of defaultPrefs) {
      await savePreferenceMemory(p);
    }
    prefs = defaultPrefs;
  }

  const workHoursStart = prefs.find(p => p.preferenceKey === "workHoursStart")?.value || "09:00";
  const workHoursEnd = prefs.find(p => p.preferenceKey === "workHoursEnd")?.value || "22:00";
  const preferredSessionMinutes = parseInt(prefs.find(p => p.preferenceKey === "preferredSessionMinutes")?.value || "60", 10);
  const avoidMornings = prefs.find(p => p.preferenceKey === "avoidMornings")?.value === "true";
  const avoidWeekends = prefs.find(p => p.preferenceKey === "avoidWeekends")?.value === "true";
  const avoidEvenings = prefs.find(p => p.preferenceKey === "avoidEvenings")?.value === "true";
  const estimateAdjustmentFactor = parseFloat(prefs.find(p => p.preferenceKey === "estimateAdjustmentFactor")?.value || "1.0");

  const userPreferences = {
    workHoursStart,
    workHoursEnd,
    preferredSessionMinutes,
    avoidMornings,
    avoidWeekends,
    avoidEvenings,
    estimateAdjustmentFactor
  };

  return {
    timestamp: new Date().toISOString(),
    activeGoals,
    upcomingDeadlines,
    userPreferences,
  };
}

