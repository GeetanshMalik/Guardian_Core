import { Router } from "express";
import { metricsRegistry } from "../../infrastructure/metrics.js";
import { getGoals } from "../../db.js";
import { GeminiAdapter } from "../../integration/google.js";

const router = Router();

/**
 * GET /health — Liveness and Readiness check endpoint
 */
router.get("/health", async (req, res) => {
  const healthStatus: any = {
    status: "UP",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: "UNKNOWN",
      gemini: "UNKNOWN",
      oauth: "UNKNOWN"
    }
  };

  // 1. Verify Database/Firestore connectivity
  try {
    await getGoals();
    healthStatus.dependencies.database = "HEALTHY";
  } catch (err) {
    healthStatus.dependencies.database = "DEGRADED";
    healthStatus.status = "DEGRADED";
  }

  // 2. Verify Gemini API Config Status
  try {
    const isMock = GeminiAdapter.isMock();
    healthStatus.dependencies.gemini = isMock ? "MOCK_FALLBACK" : "HEALTHY";
  } catch (err) {
    healthStatus.dependencies.gemini = "DEGRADED";
    healthStatus.status = "DEGRADED";
  }

  // 3. Verify OAuth Config Status
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  healthStatus.dependencies.oauth = (clientId && clientSecret) ? "CONFIGURED" : "MOCK_MODE";

  res.json(healthStatus);
});

/**
 * GET /metrics — Telemetry & SLO Summary
 */
router.get("/metrics", (req, res) => {
  try {
    const summary = metricsRegistry.getSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
