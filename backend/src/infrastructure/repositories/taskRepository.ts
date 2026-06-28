/**
 * Repository: Tasks (§18.9, §19.21)
 */
import {
  getTasks,
  getTasksByGoalId,
  saveTask,
  deleteTask,
} from "../../db.js";
import type { ITaskRepository } from "../../core/interfaces.js";
import type { Task } from "../../types.js";

export class TaskRepository implements ITaskRepository {
  async findAll(): Promise<Task[]> {
    return getTasks();
  }

  async findById(id: string): Promise<Task | undefined> {
    const all = await getTasks();
    return all.find((t) => t.id === id);
  }

  async findByGoalId(goalId: string): Promise<Task[]> {
    return getTasksByGoalId(goalId);
  }

  async save(task: Task): Promise<void> {
    await saveTask(task);
  }

  async delete(id: string): Promise<void> {
    await deleteTask(id);
  }
}

export const taskRepository = new TaskRepository();
