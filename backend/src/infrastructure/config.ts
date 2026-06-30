/**
 * Infrastructure: Centralized Configuration (§18.14)
 * 
 * All environment-driven configuration in one place.
 * No hardcoded values. Validates required env vars at startup.
 * Structured with clear typed namespaces.
 */
import dotenv from "dotenv";

dotenv.config();

function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  return "";
}

function envInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (value !== undefined) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value !== undefined) return value === "true" || value === "1";
  return fallback;
}

export const config = {
  /** Application */
  app: {
    port: envInt("PORT", 3000),
    env: env("NODE_ENV", "development"),
    url: env("APP_URL", "http://localhost:3000"),
    isProduction: env("NODE_ENV") === "production",
  },

  /** Gemini AI */
  gemini: {
    apiKey: env("GEMINI_API_KEY"),
    model: env("GEMINI_MODEL", "gemini-2.5-flash"),
    maxTokens: envInt("GEMINI_MAX_TOKENS", 8192),
    temperature: parseFloat(env("GEMINI_TEMPERATURE", "0.7")),
  },

  /** Google OAuth */
  oauth: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    callbackUrl: env("GOOGLE_CALLBACK_URL", ""),
    scopes: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },

  /** Firestore / Persistence */
  firestore: {
    projectId: env("GOOGLE_CLOUD_PROJECT_ID") || env("GOOGLE_CLOUD_PROJECT") || env("GCLOUD_PROJECT") || env("GCP_PROJECT"),
    useEmulator: envBool("FIRESTORE_EMULATOR", false),
    emulatorHost: env("FIRESTORE_EMULATOR_HOST", "localhost:8080"),
  },

  /** Background Workers */
  workers: {
    mainLoopIntervalMs: envInt("WORKER_INTERVAL_MS", 30000),
    researchFreshnessCheckMs: envInt("RESEARCH_FRESHNESS_MS", 45000),
    confidenceDecayIntervalMs: envInt("CONFIDENCE_DECAY_MS", 60000),
    memoryConsolidationMs: envInt("MEMORY_CONSOLIDATION_MS", 120000),
    researchMaxAgeHours: envInt("RESEARCH_MAX_AGE_HOURS", 24),
  },

  /** Rate Limiting */
  rateLimit: {
    windowMs: envInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    maxRequests: envInt("RATE_LIMIT_MAX", 200),
  },

  /** Feature Flags */
  featureFlags: {
    enableResearch: envBool("FF_RESEARCH", true),
    enableLearning: envBool("FF_LEARNING", true),
    enableCalendarSync: envBool("FF_CALENDAR_SYNC", true),
    enableAutoRecovery: envBool("FF_AUTO_RECOVERY", true),
    enableNotifications: envBool("FF_NOTIFICATIONS", true),
  },

  /** Retry Policies */
  retry: {
    maxRetries: envInt("RETRY_MAX", 3),
    baseDelayMs: envInt("RETRY_BASE_DELAY_MS", 1000),
    timeoutMs: envInt("RETRY_TIMEOUT_MS", 15000),
  },

  /** Notifications */
  notifications: {
    maxStored: envInt("NOTIFICATIONS_MAX_STORED", 100),
    dailyBriefHour: envInt("DAILY_BRIEF_HOUR", 8),
  },

  /**
   * Validate that critical env vars are set.
   * Call once at startup.
   */
  validate(): string[] {
    const warnings: string[] = [];

    if (!config.gemini.apiKey) {
      warnings.push("GEMINI_API_KEY is not set — AI features will use fallback responses.");
    }

    if (!config.oauth.clientId || !config.oauth.clientSecret) {
      warnings.push("Google OAuth credentials not set — using mock authentication.");
    }

    return warnings;
  },
} as const;
