/**
 * Repository: Governance (§18.9)
 */
import { getAutonomyLevel, saveAutonomyLevel } from "../../db.js";
import type { IGovernanceRepository } from "../../core/interfaces.js";
import type { AutonomyLevel } from "../../types.js";

export class GovernanceRepository implements IGovernanceRepository {
  async getAutonomyLevel(): Promise<AutonomyLevel> {
    return getAutonomyLevel();
  }

  async saveAutonomyLevel(level: AutonomyLevel): Promise<void> {
    await saveAutonomyLevel(level);
  }
}

export const governanceRepository = new GovernanceRepository();
