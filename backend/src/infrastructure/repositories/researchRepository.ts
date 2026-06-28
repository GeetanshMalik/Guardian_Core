/**
 * Repository: Research (§18.9)
 */
import {
  getResearchPackages,
  getResearchPackagesByGoalId,
  saveResearchPackage,
  deleteResearchPackage,
} from "../../db.js";
import type { IResearchRepository } from "../../core/interfaces.js";
import type { ResearchPackage } from "../../types.js";

export class ResearchRepository implements IResearchRepository {
  async findByGoalId(goalId: string): Promise<ResearchPackage[]> {
    return getResearchPackagesByGoalId(goalId);
  }

  async findAll(): Promise<ResearchPackage[]> {
    return getResearchPackages();
  }

  async save(pkg: ResearchPackage): Promise<void> {
    await saveResearchPackage(pkg);
  }

  async delete(id: string): Promise<void> {
    await deleteResearchPackage(id);
  }
}

export const researchRepository = new ResearchRepository();
