/**
 * Repository: Tools (§18.9)
 */
import {
  getToolRegistry,
  saveToolDefinition,
  getToolExecutionLogs,
} from "../../db.js";
import type { IToolRepository } from "../../core/interfaces.js";
import type { ToolDefinition, ToolExecutionLog } from "../../types.js";

export class ToolRepository implements IToolRepository {
  async getRegistry(): Promise<ToolDefinition[]> {
    return getToolRegistry();
  }

  async saveTool(tool: ToolDefinition): Promise<void> {
    await saveToolDefinition(tool);
  }

  async getLogs(): Promise<ToolExecutionLog[]> {
    return getToolExecutionLogs();
  }
}

export const toolRepository = new ToolRepository();
