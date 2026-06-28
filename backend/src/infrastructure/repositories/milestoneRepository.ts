/**
 * Repository: Milestones (§18.9, §19.21)
 */
import {
  getMilestones,
  getMilestonesByGoalId,
  saveMilestone,
  deleteMilestone,
} from "../../db.js";
import type { IMilestoneRepository } from "../../core/interfaces.js";
import type { Milestone } from "../../types.js";

export class MilestoneRepository implements IMilestoneRepository {
  async findAll(): Promise<Milestone[]> {
    return getMilestones();
  }

  async findById(id: string): Promise<Milestone | undefined> {
    const all = await getMilestones();
    return all.find((m) => m.id === id);
  }

  async findByGoalId(goalId: string): Promise<Milestone[]> {
    return getMilestonesByGoalId(goalId);
  }

  async save(milestone: Milestone): Promise<void> {
    await saveMilestone(milestone);
  }

  async delete(id: string): Promise<void> {
    await deleteMilestone(id);
  }
}

export const milestoneRepository = new MilestoneRepository();
