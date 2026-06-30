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
  healthStatus.debug = {
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "undefined",
    APP_URL: process.env.APP_URL || "undefined",
    FRONTEND_URL: process.env.FRONTEND_URL || "undefined",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "undefined",
    NODE_ENV: process.env.NODE_ENV || "undefined"
  };

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
