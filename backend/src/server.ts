/**
 * Guardian Core — Server Entry Point
 * 
 * Slim orchestrator that:
 * 1. Validates configuration (§18.14)
 * 2. Initializes infrastructure (DB, logging)
 * 3. Mounts API Gateway middleware (tracing, rate limiting, error handling)
 * 4. Mounts modular route files
 * 5. Registers domain event listeners (eager)
 * 6. Starts background workers
 * 7. Serves the frontend (Vite dev or static build)
 * 
 * Chapter 17–18: Overall System + Backend Architecture
 */
import express from "express";
import path from "path";
import http from "node:http";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { initDb } from "./db.js";
import { startAgentWorker, stopAgentWorker } from "./worker.js";
import { config } from "./infrastructure/config.js";
import { container } from "./infrastructure/container.js";

// API Gateway Middleware (§17.5 — API Layer)
import { tracingMiddleware } from "./api/middleware/tracing.js";
import { errorHandlerMiddleware } from "./api/middleware/errorHandler.js";
import { idempotencyMiddleware } from "./api/middleware/idempotency.js";
import { conversationRateLimiter, goalRateLimiter, authRateLimiter } from "./api/middleware/rateLimiter.js";
import { authMiddleware } from "./api/middleware/auth.js";

// Modular Route Files (§17.5 — API Layer)
import authRoutes from "./api/routes/auth.js";
import goalsRoutes from "./api/routes/goals.js";
import memoryRoutes from "./api/routes/memory.js";
import toolsRoutes from "./api/routes/tools.js";
import notificationsRoutes from "./api/routes/notifications.js";
import settingsRoutes from "./api/routes/settings.js";
import conversationsRoutes from "./api/routes/conversations.js";
import healthRoutes from "./api/routes/health.js";
import { loadSecretsIntoEnv } from "./infrastructure/secretManager.js";

// Load environment variables
dotenv.config();

async function startServer() {
  // Load secrets from Google Secret Manager before verifying configuration
  await loadSecretsIntoEnv();

  // Validate configuration at startup (§18.14)
  const configWarnings = config.validate();
  if (configWarnings.length > 0) {
    console.warn("[Config] Startup warnings:");
    configWarnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }

  // Ensure database directory and file are initialized
  initDb();

  // Start the background agent worker pool
  if (process.env.DISABLE_WORKERS === "true") {
    console.log("[Worker] Background workers disabled via DISABLE_WORKERS environment variable.");
  } else {
    startAgentWorker();
  }

  // Register domain event listeners at startup (eager — §17.8)
  container.notificationService.registerEventListeners();
  container.analyticsService.registerEventListeners();
  container.auditService.registerEventListeners();

  console.log(`[GuardianCore] Container ready. Registered services: guardianCore, goalService, notificationService, researchService, calendarService, analyticsService`);

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Set trust proxy to support secure cookies over proxies (e.g., Cloud Run behind Nginx)
  app.set("trust proxy", 1);

  // ─── API Gateway Layer (§17.5) ──────────────────────────────────────────

  // CORS
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // JSON Body parsing
  app.use(express.json());

  // Cookie parsing for secure authentication session headers
  app.use(cookieParser());

  // Request tracing (§17.13 — Observability)
  app.use(tracingMiddleware);

  // Idempotency Key Tracking (§22.21)
  app.use(idempotencyMiddleware);

  // Rate Limiter (config-driven — §18.14)
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again later." }
  });
  app.use("/api/", limiter);

  // Health & Metrics Telemetry (Unauthenticated)
  app.use(healthRoutes);

  // Authenticate all API requests (Zero Trust)
  app.use("/api", authMiddleware);

  // ─── Route Mounting ─────────────────────────────────────────────────────

  // Auth routes (OAuth flow — not under /api prefix, rate-limited)
  app.use("/auth", authRateLimiter, authRoutes);

  // Versioned v1 API Routes (§22.5)
  app.use("/api/v1/conversations", conversationRateLimiter, conversationsRoutes);
  app.use("/api/v1/goals", goalRateLimiter, goalsRoutes);
  app.use("/api/v1/memory", memoryRoutes);
  app.use("/api/v1/tools", toolsRoutes);
  app.use("/api/v1/notifications", notificationsRoutes);
  app.use("/api/v1", settingsRoutes);

  // Legacy API Routes for Backward Compatibility (§22.5 migration window)
  app.use("/api/conversations", conversationRateLimiter, conversationsRoutes);
  app.use("/api/goals", goalRateLimiter, goalsRoutes);
  app.use("/api/memory", memoryRoutes);
  app.use("/api/tools", toolsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api", settingsRoutes);

  // ─── Global Error Handler (§17.11 — Fault Isolation) ───────────────────

  app.use(errorHandlerMiddleware);

  // ─── Frontend Serving ───────────────────────────────────────────────────

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: path.join(process.cwd(), "frontend"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "frontend", "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ─── Server Start & Graceful Shutdown ───────────────────────────────────

  const httpServer = http.createServer(app);

  // Initialize the WebSocket Gateway Server (§22.15)
  const { initWebSocketServer } = await import("./api/websocket.js");
  initWebSocketServer(httpServer);

  const server = httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    console.log("Shutting down cleanly...");
    stopAgentWorker();
    server.close();
  });
}

startServer();
