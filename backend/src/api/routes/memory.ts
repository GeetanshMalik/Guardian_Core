/**
 * API Routes: Memory
 * Extracted from server.ts — All /api/memory/* endpoints
 */
import { Router } from "express";
import { container } from "../../infrastructure/container.js";
import { authMiddleware } from "../middleware/auth.js";

const { memoryRepository } = container;

const getPreferenceMemories = () => memoryRepository.getPreferenceMemories();
const getSemanticMemories = () => memoryRepository.getSemanticMemories();
const getEpisodicMemories = () => memoryRepository.getEpisodicMemories();
const getDecisionMemories = () => memoryRepository.getDecisionMemories();
const getReflectionMemories = () => memoryRepository.getReflectionMemories();
const savePreferenceMemory = (pref: any) => memoryRepository.savePreferenceMemory(pref);
const deleteMemory = (layer: string, id: string) => memoryRepository.deleteMemory(layer, id);
const resetPersonalization = () => memoryRepository.resetAll();

const router = Router();

// Secure all memory endpoints
router.use(authMiddleware);

// A. Fetch all memory layers grouped together
router.get("/", async (req, res) => {
  try {
    const preferences = await getPreferenceMemories();
    const semanticFacts = await getSemanticMemories();
    const recentEpisodes = await getEpisodicMemories();
    const historicalDecisions = await getDecisionMemories();
    const activeReflections = await getReflectionMemories();
    
    res.json({
      preferences,
      semanticFacts,
      recentEpisodes,
      historicalDecisions,
      activeReflections
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// B. Update/Save a specific preference
router.put("/preferences/:id", async (req: any, res) => {
  const { id } = req.params;
  const { value, confidence, preferenceKey, source } = req.body;
  try {
    const existing = await getPreferenceMemories();
    const pref = existing.find(p => p.id === id);
    if (!pref) {
      return res.status(404).json({ error: "Preference not found" });
    }
    
    const updatedPref = {
      ...pref,
      value: value !== undefined ? String(value) : pref.value,
      confidence: confidence !== undefined ? Number(confidence) : pref.confidence,
      preferenceKey: preferenceKey !== undefined ? preferenceKey : pref.preferenceKey,
      source: source !== undefined ? source : pref.source,
      lastUpdated: new Date().toISOString(),
      version: (pref.version || 1) + 1
    };
    
    await savePreferenceMemory(updatedPref);
    
    await container.auditService.log(
      "MEMORY_UPDATE",
      `memory/preferences/${id}`,
      { preferenceKey: updatedPref.preferenceKey, value: updatedPref.value },
      req.ip,
      req.user.email
    );

    res.json(updatedPref);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// C. Delete memory record (selective forgetting)
router.delete("/:layer/:id", async (req: any, res) => {
  const { layer, id } = req.params;
  try {
    await deleteMemory(layer, id);
    await container.auditService.log(
      "MEMORY_DELETE",
      `memory/${layer}/${id}`,
      { layer, id },
      req.ip,
      req.user.email
    );
    res.json({ success: true, message: `Memory from layer '${layer}' with id '${id}' successfully deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// D. Reset personalization (clear all memory layers)
router.post("/reset", async (req: any, res) => {
  try {
    await resetPersonalization();
    await container.auditService.log(
      "MEMORY_RESET",
      "memory",
      { action: "reset_all" },
      req.ip,
      req.user.email
    );
    res.json({ success: true, message: "Personalization reset complete. All long-term memories cleared." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// E. Export memory to JSON file download
router.get("/export", async (req: any, res) => {
  try {
    const preferences = await getPreferenceMemories();
    const semanticFacts = await getSemanticMemories();
    const recentEpisodes = await getEpisodicMemories();
    const historicalDecisions = await getDecisionMemories();
    const activeReflections = await getReflectionMemories();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      memoryProfile: {
        preferences,
        semanticFacts,
        recentEpisodes,
        historicalDecisions,
        activeReflections
      }
    };
    
    await container.auditService.log(
      "MEMORY_EXPORT",
      "memory",
      { action: "export" },
      req.ip,
      req.user.email
    );

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=guardian_memory_export.json");
    res.json(exportData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// H. Submit preference feedback (thumbs-up/thumbs-down)
router.post("/preferences/:id/feedback", async (req: any, res) => {
  const { id } = req.params;
  const { feedback } = req.body;
  
  if (feedback !== "up" && feedback !== "down") {
    return res.status(400).json({ error: "Feedback must be 'up' or 'down'" });
  }

  try {
    const existing = await getPreferenceMemories();
    const pref = existing.find(p => p.id === id);
    if (!pref) {
      return res.status(404).json({ error: "Preference not found" });
    }

    const oldConfidence = pref.confidence;
    if (feedback === "up") {
      pref.confidence = Math.min(100, pref.confidence + 20);
      pref.evidenceCount = (pref.evidenceCount || 1) + 1;
      if (pref.confidence >= 75) {
        pref.status = "promoted";
      }
    } else {
      pref.confidence = Math.max(40, pref.confidence - 30);
      if (pref.confidence < 75) {
        pref.status = "hypothesis";
      }
    }
    
    pref.lastUpdated = new Date().toISOString();
    pref.version = (pref.version || 1) + 1;
    
    await savePreferenceMemory(pref);
    
    console.log(`[LearningEngine] Feedback received for ${pref.preferenceKey}: ${feedback}. Confidence updated: ${oldConfidence}% -> ${pref.confidence}%.`);
    
    await container.auditService.log(
      "MEMORY_FEEDBACK",
      `memory/preferences/${id}/feedback`,
      { preferenceKey: pref.preferenceKey, feedback, confidence: pref.confidence },
      req.ip,
      req.user.email
    );

    res.json(pref);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
