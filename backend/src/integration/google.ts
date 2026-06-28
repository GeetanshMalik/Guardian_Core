import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import { executeWithRetry } from "../utils.js";
import { config } from "../infrastructure/config.js";
import { CalendarSession, Task } from "../types.js";

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

export class GeminiAdapter {
  public static getClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("WARNING: GEMINI_API_KEY is not defined. Using mock fallback mode for agents.");
      }
      aiClient = new GoogleGenAI({
        apiKey: apiKey || "MOCK_KEY_FOR_LOCAL_DEV",
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  public static isMock(): boolean {
    return !process.env.GEMINI_API_KEY || process.env.MOCK_GEMINI === "true" || process.env.NODE_ENV === "test";
  }

  public static async generateStructuredContent<T>(
    prompt: string,
    responseSchema: any,
    useSearchGrounding = false
  ): Promise<T> {
    const client = this.getClient();
    const config: any = {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    };
    if (useSearchGrounding) {
      config.tools = [{ googleSearch: {} }];
    }
    const response = await executeWithRetry(() =>
      client.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config,
      })
    );
    return JSON.parse(response.text || "{}") as T;
  }
}

export class CalendarAdapter {
  public static async syncCalendarSessions(
    accessToken: string | null,
    sessionIds: string[],
    schedule: CalendarSession[],
    tasks: Task[],
    goalTitle: string
  ): Promise<string[]> {
    const syncedSessionIds: string[] = [];

    // If we have a valid non-mock Access Token, push events to Google Calendar!
    if (accessToken && accessToken !== "mock_access_token") {
      console.log(`[CalendarAdapter] Syncing ${sessionIds.length} event blocks to real Google Calendar...`);
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const sessionsToSync = schedule.filter(s => sessionIds.includes(s.id));

      for (const session of sessionsToSync) {
        const task = tasks.find(t => t.id === session.taskId);
        const startDateTime = `${session.date}T${session.startTime}:00`;
        const endDateTime = `${session.date}T${session.endTime}:00`;

        const event = {
          summary: session.title,
          description: `Deadline Guardian AI Work Block\nSession ID: ${session.id}\nGoal: "${goalTitle}"\nTask description: ${task?.description || ""}`,
          start: {
            dateTime: new Date(startDateTime).toISOString(),
            timeZone: "UTC",
          },
          end: {
            dateTime: new Date(endDateTime).toISOString(),
            timeZone: "UTC",
          },
          reminders: {
            useDefault: true
          }
        };

        // Push event with retry wrapping
        await executeWithRetry(() =>
          calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
          })
        );
        syncedSessionIds.push(session.id);
      }
    } else {
      console.warn("[CalendarAdapter] Simulating Calendar sync (Google API is in local fallback mode).");
      // Simulate sync for mock
      sessionIds.forEach(id => {
        if (schedule.some(s => s.id === id)) {
          syncedSessionIds.push(id);
        }
      });
    }

    return syncedSessionIds;
  }
}
export { Type };
