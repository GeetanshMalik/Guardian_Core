/**
 * Repository: Jobs (§18.9)
 */
import { getJobs, saveJob } from "../../db.js";
import type { IJobRepository } from "../../core/interfaces.js";
import type { AgentJob } from "../../types.js";

export class JobRepository implements IJobRepository {
  async findAll(): Promise<AgentJob[]> {
    return getJobs();
  }

  async save(job: AgentJob): Promise<void> {
    await saveJob(job);
  }
}

export const jobRepository = new JobRepository();
