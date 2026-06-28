/**
 * Repository: Memory (§18.9)
 * 
 * Single repository covering all memory types.
 * Domain queries for memory analysis.
 */
import {
  getEpisodicMemories,
  getSemanticMemories,
  getPreferenceMemories,
  getDecisionMemories,
  getReflectionMemories,
  savePreferenceMemory,
  saveSemanticMemory,
  deleteMemory,
  resetPersonalization,
  getObservations,
  deleteObservation,
} from "../../db.js";
import type { IMemoryRepository } from "../../core/interfaces.js";
import type {
  EpisodicMemory,
  SemanticMemory,
  PreferenceMemory,
  DecisionMemory,
  ReflectionMemory,
  Observation,
} from "../../types.js";

export class MemoryRepository implements IMemoryRepository {
  async getEpisodicMemories(): Promise<EpisodicMemory[]> {
    return getEpisodicMemories();
  }

  async getSemanticMemories(): Promise<SemanticMemory[]> {
    return getSemanticMemories();
  }

  async getPreferenceMemories(): Promise<PreferenceMemory[]> {
    return getPreferenceMemories();
  }

  async getDecisionMemories(): Promise<DecisionMemory[]> {
    return getDecisionMemories();
  }

  async getReflectionMemories(): Promise<ReflectionMemory[]> {
    return getReflectionMemories();
  }

  async savePreferenceMemory(pref: PreferenceMemory): Promise<void> {
    await savePreferenceMemory(pref);
  }

  async saveSemanticMemory(fact: SemanticMemory): Promise<void> {
    await saveSemanticMemory(fact);
  }

  async deleteMemory(layer: string, id: string): Promise<void> {
    await deleteMemory(layer, id);
  }

  async resetAll(): Promise<void> {
    await resetPersonalization();
  }

  async getObservations(): Promise<Observation[]> {
    return getObservations();
  }

  async deleteObservation(id: string): Promise<void> {
    await deleteObservation(id);
  }
}

export const memoryRepository = new MemoryRepository();
