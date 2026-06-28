/**
 * Domain Service: Research (§17.7 — Research Domain)
 * 
 * Wraps research package CRUD and emits ResearchCompleted events.
 */
import {
  getResearchPackagesByGoalId,
  deleteResearchPackage as dbDeleteResearch,
} from "../../db.js";
import { domainEventBus } from "../events.js";
import { ResearchIntelligence } from "../../cognitive/research.js";
import type { ResearchPackage } from "../../types.js";

export class ResearchService {
  async getPackagesByGoalId(goalId: string): Promise<ResearchPackage[]> {
    return getResearchPackagesByGoalId(goalId);
  }

  async triggerResearch(goalId: string, topic: string, context: string): Promise<ResearchPackage> {
    const pkg = await ResearchIntelligence.generateResearchPackage(goalId, topic, context);

    domainEventBus.emit({
      type: "ResearchCompleted",
      researchPackage: pkg,
      goalId,
      timestamp: new Date().toISOString(),
    });

    return pkg;
  }

  async deletePackage(id: string): Promise<void> {
    await dbDeleteResearch(id);
  }
}

/** Singleton instance */
export const researchService = new ResearchService();
