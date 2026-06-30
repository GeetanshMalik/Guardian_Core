/**
 * API Routes: Settings & Governance
 * Extracted from server.ts — User profile, logout, autonomy, learning, research, and worker routes
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { container } from "../../infrastructure/container.js";
import { getDeadLetterEvents, deleteDeadLetterEvent } from "../../db.js";
import { domainEventBus } from "../../domain/events.js";
import { workerExecutionEngine } from "../../worker/engine.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const { governanceRepository, jobRepository, memoryRepository, researchRepository } = container;

const getAutonomyLevel = () => governanceRepository.getAutonomyLevel();
const saveAutonomyLevel = (level: any) => governanceRepository.saveAutonomyLevel(level);
const getJobs = () => jobRepository.findAll();
const getObservations = () => memoryRepository.getObservations();
const deleteObservation = (id: string) => memoryRepository.deleteObservation(id);
const deleteResearchPackage = (id: string) => researchRepository.delete(id);

const router = Router();

// Mount global authentication check on all settings and governance routes
router.use(authMiddleware);

// 3. Retrieve currently logged-in user profile
router.get("/user/profile", (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user: req.user });
});

// 4. Log user out and clear secure state cookies
router.post("/auth/logout", async (req: any, res) => {
  const userEmail = req.user?.email || "unknown";
  
  const isProd = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" as const : "lax" as const
  };

  res.clearCookie("user_session", cookieOpts);
  res.clearCookie("google_access_token", cookieOpts);
  res.clearCookie("google_refresh_token", cookieOpts);
  res.clearCookie("user_profile", cookieOpts);

  await container.auditService.log(
    "AUTH_LOGOUT",
    `users/${userEmail}`,
    { email: userEmail },
    req.ip,
    userEmail
  ).catch(err => console.error("Failed to log logout audit:", err));

  res.json({ success: true });
});

// F. Fetch raw observations logs
router.get("/learning/observations", async (req, res) => {
  try {
    const obs = await getObservations();
    res.json(obs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// G. Delete an observation
router.delete("/learning/observations/:id", async (req: any, res) => {
  const { id } = req.params;
  const userEmail = req.user?.email || "unknown";
  try {
    await deleteObservation(id);
    await container.auditService.log(
      "MEMORY_DELETE",
      `memory/observations/${id}`,
      { type: "observation" },
      req.ip,
      userEmail
    );
    res.json({ success: true, message: "Observation deleted." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// I. Fetch current autonomy level configuration
router.get("/governance/autonomy", async (req, res) => {
  try {
    const level = await getAutonomyLevel();
    res.json({ autonomyLevel: level });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// J. Save/Update autonomy level configuration (Admin only)
router.post("/governance/autonomy", requireRole(["admin"]), async (req: any, res) => {
  const { autonomyLevel } = req.body;
  const allowed = ["advisory", "assisted", "delegated", "trusted_automation"];
  if (!allowed.includes(autonomyLevel)) {
    return res.status(400).json({ error: "Invalid autonomy level value" });
  }
  try {
    await saveAutonomyLevel(autonomyLevel);
    await container.auditService.log(
      "POLICY_UPDATE",
      "governance/autonomy",
      { autonomyLevel },
      req.ip,
      req.user.email
    );
    res.json({ success: true, autonomyLevel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Fetch background agent/worker audits & logs (Admin only)
router.get("/worker/logs", requireRole(["admin"]), async (req, res) => {
  try {
    const jobs = await getJobs();
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch current background worker execution statuses & health metrics (Admin only)
router.get("/worker/status", requireRole(["admin"]), async (req, res) => {
  try {
    const statuses = workerExecutionEngine.getAllWorkerStatuses();
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manually trigger a background worker execution (Admin only)
router.post("/worker/:name/trigger", requireRole(["admin"]), async (req: any, res) => {
  const { name } = req.params;
  try {
    // Run worker asynchronously
    workerExecutionEngine.executeWorker(name).catch(err => {
      console.error(`[API] Manual worker execution failed for "${name}":`, err);
    });

    // Log the manual audit log
    await container.auditService.log(
      "TRIGGER_WORKER",
      `worker/${name}`,
      { triggeredBy: req.user.email },
      req.ip,
      req.user.email
    );

    res.json({ success: true, message: `Worker "${name}" triggered successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch system audit logs for sensitive events (Admin only)
router.get("/governance/audit-logs", requireRole(["admin"]), async (req, res) => {
  try {
    const logs = await container.auditService.getAll();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7g. Delete a specific research package
router.delete("/research/:id", async (req: any, res) => {
  const { id } = req.params;
  const userEmail = req.user?.email || "unknown";
  try {
    await deleteResearchPackage(id);
    await container.auditService.log(
      "MEMORY_DELETE",
      `research/${id}`,
      { type: "research_package" },
      req.ip,
      userEmail
    );
    res.json({ success: true, message: `Research Package ${id} deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVENT-DRIVEN ARCHITECTURE GOVERNANCE ENDPOINTS ---

// Fetch all Dead Letter Queue (DLQ) events (Admin only)
router.get("/governance/dlq", requireRole(["admin"]), async (req, res) => {
  try {
    const events = await getDeadLetterEvents();
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual replay of a DLQ event (Admin only)
router.post("/governance/dlq/:eventId/replay", requireRole(["admin"]), async (req: any, res) => {
  const { eventId } = req.params;
  try {
    const dlqEvents = await getDeadLetterEvents();
    const item = dlqEvents.find(e => e.id === eventId);
    if (!item) {
      return res.status(404).json({ error: `DLQ event item with ID "${eventId}" not found.` });
    }

    // Trigger replay via Event Bus
    await domainEventBus.replayEvent(item.eventPayload, item.subscriberName);

    // Remove from DLQ on successful execution
    await deleteDeadLetterEvent(eventId);

    // Audit trace
    await container.auditService.log(
      "EVENT_REPLAY_SUCCESS",
      `dlq/${eventId}`,
      { subscriberName: item.subscriberName, eventId: item.eventId },
      req.ip,
      req.user.email
    );

    res.json({ success: true, message: `Successfully replayed event to subscriber "${item.subscriberName}" and cleared from DLQ.` });
  } catch (err: any) {
    console.error(`[DLQ Replay Route] Failed to replay event ${eventId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk/historical replay of events matching correlationId or timestamp range (Admin only)
router.post("/governance/events/replay", requireRole(["admin"]), async (req: any, res) => {
  const { correlationId, startTime, endTime } = req.body;
  try {
    if (!correlationId && !startTime && !endTime) {
      return res.status(400).json({ error: "At least one filtering parameter (correlationId, startTime, or endTime) must be provided." });
    }

    const dispatchCount = await domainEventBus.replayRangeOrCorrelationId({
      correlationId,
      startTime,
      endTime
    });

    // Audit trace
    await container.auditService.log(
      "HISTORICAL_REPLAY",
      "governance/events",
      { correlationId, startTime, endTime, dispatchCount },
      req.ip,
      req.user.email
    );

    res.json({ success: true, dispatchCount });
  } catch (err: any) {
    console.error("[Events Replay Route] Bulk replay failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch Google Calendar events for the connected user (or mock events if not authorized/mock)
const googleCalendarDbPath = path.join(process.cwd(), "backend", "src", "db", "google_calendar_events.json");

function getMockGoogleCalendarEvents() {
  if (!fs.existsSync(googleCalendarDbPath)) {
    fs.writeFileSync(googleCalendarDbPath, JSON.stringify([], null, 2));
    return [];
  }
  
  try {
    const raw = fs.readFileSync(googleCalendarDbPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out the initial hardcoded mock events (mock-g1 to mock-g7) but keep user-added custom ones (mock-g-...)
      const filtered = parsed.filter(evt => !evt.id || !evt.id.startsWith("mock-g") || evt.id.startsWith("mock-g-"));
      if (filtered.length !== parsed.length) {
        fs.writeFileSync(googleCalendarDbPath, JSON.stringify(filtered, null, 2));
      }
      return filtered;
    }
    return [];
  } catch (err) {
    console.error("Failed to read google_calendar_events.json:", err);
    return [];
  }
}

function saveMockGoogleCalendarEvents(events: any[]) {
  try {
    fs.writeFileSync(googleCalendarDbPath, JSON.stringify(events, null, 2));
  } catch (err) {
    console.error("Failed to save google_calendar_events.json:", err);
  }
}

router.get("/calendar/events", async (req: any, res) => {
  const { google } = await import("googleapis");
  const accessToken = req.cookies?.google_access_token;
  
  // If we have a real access token, try to pull events from Google Calendar API
  if (accessToken && accessToken !== "mock_access_token") {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 2); // 2 months back
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 2); // 2 months forward

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 150
      });

      const events = (response.data.items || []).map(item => {
        const start = item.start?.dateTime || item.start?.date || "";
        const end = item.end?.dateTime || item.end?.date || "";
        
        return {
          id: item.id || Math.random().toString(36).substr(2, 9),
          title: item.summary || "Untitled Event",
          description: item.description || "",
          date: start.split("T")[0],
          startTime: start.includes("T") ? start.split("T")[1].substring(0, 5) : "00:00",
          endTime: end.includes("T") ? end.split("T")[1].substring(0, 5) : "23:59",
          isGoogleEvent: true
        };
      });

      return res.json(events);
    } catch (err: any) {
      console.warn("[CalendarRoute] Failed to fetch events from real Google Calendar, falling back to mock:", err.message);
    }
  }

  res.json(getMockGoogleCalendarEvents());
});

// Create Google Calendar event (real or mock fallback)
router.post("/calendar/events", async (req: any, res) => {
  const { google } = await import("googleapis");
  const accessToken = req.cookies?.google_access_token;
  const { title, description, date, startTime, endTime } = req.body;

  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing required fields: title, date, startTime, endTime" });
  }

  if (accessToken && accessToken !== "mock_access_token") {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      
      const startDateTime = `${date}T${startTime}:00`;
      const endDateTime = `${date}T${endTime}:00`;

      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title,
          description: description || "",
          start: {
            dateTime: new Date(startDateTime).toISOString(),
            timeZone: "UTC"
          },
          end: {
            dateTime: new Date(endDateTime).toISOString(),
            timeZone: "UTC"
          }
        }
      });

      return res.json({
        id: response.data.id,
        title,
        description,
        date,
        startTime,
        endTime,
        isGoogleEvent: true
      });
    } catch (err: any) {
      console.error("[CalendarRoute] Failed to add event to Google Calendar, falling back to mock:", err.message);
    }
  }

  // Fallback / mock database insert
  const mockEvents = getMockGoogleCalendarEvents();
  const newEvent = {
    id: "mock-g-" + Math.random().toString(36).substr(2, 9),
    title,
    description: description || "",
    date,
    startTime,
    endTime,
    isGoogleEvent: true
  };
  mockEvents.push(newEvent);
  saveMockGoogleCalendarEvents(mockEvents);

  res.json(newEvent);
});

// Delete Google Calendar event (real or mock fallback)
router.delete("/calendar/events/:id", async (req: any, res) => {
  const { google } = await import("googleapis");
  const accessToken = req.cookies?.google_access_token;
  const { id } = req.params;

  if (accessToken && accessToken !== "mock_access_token") {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      
      await calendar.events.delete({
        calendarId: "primary",
        eventId: id
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[CalendarRoute] Failed to delete event from Google Calendar, falling back to mock:", err.message);
    }
  }

  // Fallback / mock database delete
  const mockEvents = getMockGoogleCalendarEvents();
  const filtered = mockEvents.filter(evt => evt.id !== id);
  saveMockGoogleCalendarEvents(filtered);

  res.json({ success: true });
});

export default router;
