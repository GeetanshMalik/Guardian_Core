# Guardian Core — Google Cloud Deployment Guide

This guide describes the production deployment architecture and steps for deploying Guardian Core on Google Cloud Platform (GCP).

---

## 1. Target Deployment Architecture

Guardian Core is deployed as two separate containerized services on **Google Cloud Run**:

```
[ Browser Client ]
        │
        ├───> [ Frontend Cloud Run ] (Static Express Web Server)
        │         │
        │         └───> Fetches static HTML/JS/CSS assets
        │
        └───> [ Backend Cloud Run ] (Express API + Background Worker Engine)
                  │
                  ├───> Firestore (NoSQL Database)
                  ├───> Secret Manager (Sensitive credentials & keys)
                  ├───> Cloud Logging (Structured JSON logs)
                  └───> External APIs (Gemini, Google OAuth, Calendar, Tasks, Gmail)
```

### Worker Deployment Strategy
To avoid duplicate worker executions and preserve transactional safety without requiring a distributed lock coordinator:
* The backend runs **both** the API server and the background agent worker pool in the same container.
* The backend Cloud Run service is configured with:
  * `--max-instances=1` (Strict concurrency limit of 1 container instance to prevent duplicate worker loops)
  * `--min-instances=1` (Prevents scaling to zero, keeping background worker cron loops running continuously)
  * `--no-cpu-throttling` (Allocates CPU continuously so worker loops execute on time even when no API requests are active)

---

## 2. Prerequisites & GCP API Enablement

Before deploying, ensure the following APIs are enabled in your Google Cloud Project (`deadline-guardian-ai-500420`):

```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  gmail.googleapis.com \
  calendar-json.googleapis.com \
  tasks.googleapis.com
```

### Firestore Setup
Initialize Firestore in Native Mode:
* Database ID: `deadline-guardian-ai` (or `(default)`)
* Location: Choose a region close to your users (e.g., `us-central1`).

---

## 3. Secret Manager Configuration

All sensitive production credentials must be stored in **Google Secret Manager**. The backend automatically loads these secrets into its environment at startup:

| Secret Name | Description | Recommended Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | From Google Cloud Console Credentials |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | From Google Cloud Console Credentials |
| `GEMINI_API_KEY` | Gemini API Key for agentic tasks | From Google AI Studio / Google Cloud |
| `JWT_SECRET` | Secret key used to sign session JWTs | Random 32+ character string |
| `ENCRYPTION_KEY` | Hex-encoded key for encrypting tokens | Random 32-byte hex string (`openssl rand -hex 32`) |

Give the Cloud Run service account the **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`) role.

---

## 4. Google OAuth 2.0 Setup

1. Go to the **APIs & Services > Credentials** page in the GCP Console.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Configure the following:
   * **Authorized JavaScript origins:**
     * `https://localhost:5173` (Development)
     * `https://guardian-core-frontend-<hash>-<region>.a.run.app` (Production Frontend URL)
   * **Authorized redirect URIs:**
     * `http://localhost:3000/auth/google/callback` (Development)
     * `https://guardian-core-backend-<hash>-<region>.a.run.app/auth/google/callback` (Production Backend URL)

---

## 5. CI/CD Deployment Pipeline

The application is deployed automatically via the GitHub Actions workflow in [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml).

### Required GitHub Repository Secrets
Add the following secrets to your GitHub repository under **Settings > Secrets and variables > Actions**:

* `GCP_SA_KEY`: A JSON service account key with permissions to build/push to Artifact Registry and deploy to Cloud Run.
* `GCP_PROJECT_ID`: `deadline-guardian-ai-500420`
* `GCP_REGION`: The target GCP region (e.g., `us-central1`).
* `FIRESTORE_DATABASE_ID`: `deadline-guardian-ai`

### Pipeline Execution
* **Automatic:** Pushing to the `main` branch automatically triggers quality gates (lint, build, test), deploys to Staging, and prepares the deployment pipeline.
* **Manual:** You can manually trigger the pipeline using the `workflow_dispatch` button in the Actions tab of your GitHub repository.

---

## 6. Verification & Troubleshooting

### Health Check
Verify the backend status by hitting the health check endpoint:
```bash
curl -f -s "https://<backend-url>/health"
```

### Production Logs
All logs are formatted as structured JSON for native parsing by **Google Cloud Logging**. You can view logs in the GCP Console under **Logging > Log Explorer** or using the `gcloud` CLI:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=guardian-core-backend-prod" --limit=50
```
