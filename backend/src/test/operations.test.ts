import { describe, it, beforeEach, afterEach, expect, resetDatabase } from "./framework.js";
import express from "express";
import http from "node:http";
import cookieParser from "cookie-parser";
import { authMiddleware, requireRole } from "../api/middleware/auth.js";
import { signJwt } from "../infrastructure/jwt.js";
import { metricsRegistry } from "../infrastructure/metrics.js";
import { getGoals, setFirestoreClientForTesting } from "../db.js";
import rateLimit from "express-rate-limit";

// Helper to make HTTP requests in tests
function request(
  server: http.Server,
  path: string,
  options: { method?: string; headers?: Record<string, string>; cookies?: string[] } = {}
): Promise<{ status: number; headers: Record<string, any>; body: string }> {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Server not listening");
  }
  
  const reqOptions: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: address.port,
    path,
    method: options.method || "GET",
    headers: { ...options.headers }
  };

  if (options.cookies) {
    reqOptions.headers!["Cookie"] = options.cookies.join("; ");
  }

  return new Promise((resolve, reject) => {
    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers as Record<string, any>,
          body: data
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Operations: Performance & SLO telemetries", () => {
  it("should record API metrics and compute compliance state", () => {
    metricsRegistry.recordApiCall("/api/goals", "GET", 200, 150); // fast
    metricsRegistry.recordApiCall("/api/goals", "GET", 200, 100); // fast
    metricsRegistry.recordApiCall("/api/goals", "GET", 200, 500); // slow (SLO violation: >300ms)

    const summary = metricsRegistry.getSummary();
    expect(summary.volumes.apiRequests).toBeGreaterThan(0);
    
    // Check API Latency SLO values
    const apiSlo = summary.serviceLevelObjectives.find(s => s.name === "API Latency (Average)");
    expect(apiSlo).toExist();
    expect(apiSlo?.actual).toBe(250); // Average of 150, 100, and 500 is 250
    expect(apiSlo?.passed).toBe(true); // 250ms is less than 300ms target
  });
});

describe("Operations: Resilience & Chaos Fallbacks", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("should fall back to local JSON database when Firestore connection triggers warning/fails", async () => {
    const mockDb = {
      collection: () => ({
        get: () => Promise.reject(new Error("Simulated Firestore connection error")),
        doc: () => ({
          get: () => Promise.reject(new Error("Simulated Firestore connection error")),
          set: () => Promise.reject(new Error("Simulated Firestore connection error"))
        })
      })
    };

    setFirestoreClientForTesting(mockDb);

    try {
      // getGoals should fall back to local JSON DB and succeed rather than throwing a crash
      const goals = await getGoals();
      expect(goals.length).toBe(0); // Succeeded with empty local db fallback
    } finally {
      setFirestoreClientForTesting(null);
    }
  });
});

describe("Operations: Security and Authentication Policies", () => {
  let app: express.Express;
  let server: http.Server;

  beforeEach(() => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());

    app.get("/api/protected", authMiddleware, (req: any, res) => {
      res.json({ success: true, email: req.user.email });
    });

    app.get("/api/admin-only", authMiddleware, requireRole(["admin"]), (req, res) => {
      res.json({ admin: true });
    });

    server = http.createServer(app);
    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
  });

  // Tear down server
  afterEach(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should return 401 Unauthorized when accessing route without token", async () => {
    const res = await request(server, "/api/protected");
    expect(res.status).toBe(401);
    expect(res.body).toContain("Unauthorized");
  });

  it("should return 401 Unauthorized when session token is invalid", async () => {
    const res = await request(server, "/api/protected", {
      headers: { "Authorization": "Bearer invalid_secret_token" }
    });
    expect(res.status).toBe(401);
  });

  it("should allow access when Bearer token is valid", async () => {
    const token = signJwt({ email: "user@example.com", name: "User", role: "user", scopes: [] });
    const res = await request(server, "/api/protected", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("user@example.com");
  });

  it("should allow access when user_session cookie is valid", async () => {
    const token = signJwt({ email: "user@example.com", name: "User", role: "user", scopes: [] });
    const res = await request(server, "/api/protected", {
      cookies: [`user_session=${token}`]
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("user@example.com");
  });

  it("should block user access to admin-only endpoint (403 Forbidden)", async () => {
    const token = signJwt({ email: "user@example.com", name: "User", role: "user", scopes: [] });
    const res = await request(server, "/api/admin-only", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    expect(res.status).toBe(403);
    expect(res.body).toContain("Forbidden");
  });

  it("should allow admin access to admin-only endpoint (200 OK)", async () => {
    const token = signJwt({ email: "admin@example.com", name: "Admin", role: "admin", scopes: [] });
    const res = await request(server, "/api/admin-only", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("admin");
  });
});

describe("Operations: Rate Limiting Enforcement", () => {
  let app: express.Express;
  let server: http.Server;

  beforeEach(() => {
    app = express();
    const testLimiter = rateLimit({
      windowMs: 500, // short window
      max: 3,        // max 3 requests
      message: "Limit hit"
    });
    app.get("/api/limited", testLimiter, (req, res) => res.send("OK"));

    server = http.createServer(app);
    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should block requests once maximum rate is exceeded", async () => {
    // Send 3 requests
    const res1 = await request(server, "/api/limited");
    const res2 = await request(server, "/api/limited");
    const res3 = await request(server, "/api/limited");
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // 4th request should get rate-limited
    const res4 = await request(server, "/api/limited");
    expect(res4.status).toBe(429);
    expect(res4.body).toContain("Limit hit");
  });
});
