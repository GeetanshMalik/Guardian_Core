import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import fs from "node:fs";
import path from "node:path";

let client: SecretManagerServiceClient | null = null;

function getSecretClient(): SecretManagerServiceClient | null {
  if (client) return client;

  const isEnabled = process.env.ENABLE_SECRET_MANAGER === "true";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (isEnabled && projectId) {
    try {
      const options: any = { projectId };
      // Respect local development key file configuration if present
      if (process.env.FIRESTORE_KEY_FILE && fs.existsSync(process.env.FIRESTORE_KEY_FILE)) {
        options.keyFilename = process.env.FIRESTORE_KEY_FILE;
      }
      client = new SecretManagerServiceClient(options);
      console.log(`[SecretManager] Initialized for project: ${projectId}`);
    } catch (err) {
      console.error("[SecretManager] Failed to initialize Secret Manager client:", err);
      client = null;
    }
  }
  return client;
}

/**
 * Accesses a secret from Google Secret Manager.
 * Falls back to environment variables if Secret Manager is not configured or fails.
 */
export async function getSecret(secretName: string, fallbackEnvVar: string): Promise<string> {
  const secretClient = getSecretClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (secretClient && projectId) {
    try {
      const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await secretClient.accessSecretVersion({ name });
      const secretVal = version.payload?.data?.toString();
      if (secretVal !== undefined && secretVal !== null) {
        console.log(`[SecretManager] Loaded secret "${secretName}" from Google Secret Manager.`);
        return secretVal;
      }
    } catch (err: any) {
      console.warn(`[SecretManager] Failed to fetch secret "${secretName}" (falling back to ${fallbackEnvVar}):`, err.message);
    }
  }

  return process.env[fallbackEnvVar] || "";
}

/**
 * Hydrates process.env with secrets loaded from Google Secret Manager.
 * Runs once during startup.
 */
export async function loadSecretsIntoEnv(): Promise<void> {
  if (process.env.ENABLE_SECRET_MANAGER !== "true") {
    console.log("[SecretManager] Secret Manager is disabled. Skipping environment hydration.");
    return;
  }

  console.log("[SecretManager] Hydrating environment variables from Google Secret Manager...");
  
  // List of secrets we manage in Secret Manager and their fallback env mappings
  const secretMappings = [
    { secret: "GEMINI_API_KEY", env: "GEMINI_API_KEY" },
    { secret: "GOOGLE_CLIENT_ID", env: "GOOGLE_CLIENT_ID" },
    { secret: "GOOGLE_CLIENT_SECRET", env: "GOOGLE_CLIENT_SECRET" },
    { secret: "JWT_SECRET", env: "JWT_SECRET" },
    { secret: "ENCRYPTION_KEY", env: "ENCRYPTION_KEY" }
  ];

  for (const mapping of secretMappings) {
    const val = await getSecret(mapping.secret, mapping.env);
    if (val) {
      process.env[mapping.env] = val;
    }
  }
  console.log("[SecretManager] Environment hydration complete.");
}
