/**
 * Core: Capability Registry (Extended for Product Realignment)
 * 
 * Dynamic capability registration for the GuardianCore façade.
 * Now includes Tool Awareness — Guardian Core always knows exactly
 * which tools are connected and what actions are possible.
 */
import type { ICapability, ICapabilityRegistry, CapabilityContext } from "./interfaces.js";
import { getConnectedToolStatuses, canPerformAction, getCapabilityReport } from "../cognitive/contextEvaluator.js";
import type { ToolStatus } from "../cognitive/contextEvaluator.js";

export class CapabilityRegistry implements ICapabilityRegistry {
  private capabilities = new Map<string, ICapability>();

  register(capability: ICapability): void {
    this.capabilities.set(capability.name, capability);
    console.log(`[CapabilityRegistry] Registered capability: ${capability.name}`);
  }

  get(name: string): ICapability | undefined {
    return this.capabilities.get(name);
  }

  getAll(): ICapability[] {
    return Array.from(this.capabilities.values());
  }

  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  // ─── Tool Awareness Extensions ──────────────────────────────────────────

  /**
   * Returns only tools with active availability and healthy status.
   */
  async getConnectedTools(): Promise<ToolStatus[]> {
    const allTools = await getConnectedToolStatuses();
    return allTools.filter(t => t.isConnected && t.isHealthy);
  }

  /**
   * Checks if a specific tool action is possible given current state.
   */
  async canPerform(toolId: string, operation: string): Promise<boolean> {
    return canPerformAction(toolId, operation);
  }

  /**
   * Generates a human-readable capability report.
   * Used to inject tool awareness into AI prompts.
   */
  async getCapabilityReport(): Promise<string> {
    return getCapabilityReport();
  }
}

export const capabilityRegistry = new CapabilityRegistry();
