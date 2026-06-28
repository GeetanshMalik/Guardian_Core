# Guardian Core — Operational Runbook (§26.17)

This runbook contains step-by-step procedures for diagnosing and mitigating operational issues inside Guardian Core production environments.

---

## 🚀 Service Summary
- **API Service**: Public-facing HTTPS server running on Cloud Run (`guardian-core-api-prod`).
- **Worker Service**: Background event and scheduling runner running on Cloud Run (`guardian-core-worker-prod`).
- **Database**: Google Cloud Firestore (native mode).
- **External Integrations**: Gemini API (Google Gen AI SDK), Google OAuth (Calendar, Gmail).

---

## 📋 Runbook Index
1. [API Unreachable or Responding with 5xx](#1-api-unreachable-or-responding-with-5xx)
2. [Worker Backlog / Scheduler Loop Stops Executing](#2-worker-backlog--scheduler-loop-stops-executing)
3. [Google Calendar Sync Failure (OAuth issues)](#3-google-calendar-sync-failure-oauth-issues)
4. [Gemini Model API Degradation or Quota Exceeded](#4-gemini-model-api-degradation-or-quota-exceeded)
5. [Firestore Database Latency or Offline Errors](#5-firestore-database-latency-or-offline-errors)

---

## 1. API Unreachable or Responding with 5xx

### Symptoms
- Frontend reports connection errors or times out.
- HTTP requests return `502 Bad Gateway`, `503 Service Unavailable`, or `504 Gateway Timeout`.
- Liveness check (`/health`) fails to respond.

### Diagnosis
1. **Check Cloud Run Logs**:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=guardian-core-api-prod" --limit=50 --project=<GCP_PROJECT_ID>
   ```
2. **Verify Instance Lifecycle**: Check if memory limit exceeded (OOM) or container failed startup validation checks.
3. **Verify Configuration**: Check that `PORT=3000` is set and the server binds to `0.0.0.0` (not `localhost`).

### Mitigation / Recovery
- **If Out of Memory (OOM)**: Increase container memory limit from 512Mi to 1024Mi using:
  ```bash
  gcloud run services update guardian-core-api-prod --memory=1024Mi --region=us-central1
  ```
- **If Secret Loading Failed**: Verify Secret Manager IAM permissions are granted to the runner Service Account. Ensure secrets have active versions.
- **Rollback to Previous Stable revision**:
  ```bash
  gcloud run services update-traffic guardian-core-api-prod --to-revisions=<STABLE_REVISION>=100 --region=us-central1
  ```

---

## 2. Worker Backlog / Scheduler Loop Stops Executing

### Symptoms
- Goals fail to update planning state.
- Automated milestones/tasks remain unchanged past deadlines.
- Daily briefs are not generated or delayed.
- `GET /api/v1/worker/status` (Admin-only) shows worker status is `idle` or hasn't updated for >1 hour.

### Diagnosis
1. **Inspect Worker Service CPU Usage**: Ensure the worker service has CPU allocation active (no CPU throttling when idle).
2. **Query Event Store**: Check if there's a dead-letter event or blocked queues.
3. **Trace Logs for Worker Errors**:
   ```bash
   gcloud logging read "resource.labels.service_name=guardian-core-worker-prod AND \"[Worker]\"" --limit=50
   ```

### Mitigation / Recovery
- **Restart Worker Service**: Forces workers to boot up and re-initialize schedulers:
  ```bash
  gcloud run services list --project=<GCP_PROJECT_ID>
  # Force a redeployment/new revision to spin up new workers:
  gcloud run services update guardian-core-worker-prod --region=us-central1
  ```
- **Manually Trigger a Specific Worker**: Execute a manual REST POST request to kickstart execution:
  ```bash
  curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://<API_URL>/api/v1/worker/<WORKER_NAME>/trigger
  ```

---

## 3. Google Calendar Sync Failure (OAuth issues)

### Symptoms
- Users see "Calendar Sync Error" banners on the dashboard UI.
- Worker logs print `[CalendarService] OAuth Token Refresh Failed: invalid_grant`.

### Diagnosis
1. **Check OAuth credentials configuration**: Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Secret Manager are correct.
2. **User Consent/Revocation**: The user may have revoked access, or their refresh token expired (OAuth consent screens in Test status expire tokens every 7 days).

### Mitigation / Recovery
- **Prompt User Re-Authentication**: User must go to Settings Page and click "Reconnect Google Calendar". This forces a new authorization code and refresh token flow.
- **Verify redirect URIs**: Verify that Google Cloud Console contains the correct `https://<API_URL>/auth/callback` in the authorized redirect URIs.

---

## 4. Gemini Model API Degradation or Quota Exceeded

### Symptoms
- Plans/Reflections fail to generate.
- Logs report HTTP status `429 Too Many Requests` or `503 Service Unavailable` from `googleapis.com/v1/models/gemini`.

### Diagnosis
1. Check Google AI Studio / GCP Console quotas page for Gemini API consumption.
2. Verify if client is hitting the default free rate limits (15 RPM for gemini-2.5-flash).

### Mitigation / Recovery
- **Automatic Fallbacks**: The codebase automatically falls back to mock responses or cached memory packages if the API fails, ensuring the application stays up.
- **Model Downgrade / Swapping**: Swap to a more lightweight model or increase quotas. You can update the config variables dynamically:
  ```bash
  # Example: switch to a legacy model or adjust max tokens to conserve usage
  # Modify GEMINI_MODEL secret in Secret Manager and run clean container boot.
  ```

---

## 5. Firestore Database Latency or Offline Errors

### Symptoms
- API latency benchmarks (`GET /metrics`) exceed the 300ms SLO target.
- DB reads/writes throw connection timeouts.

### Diagnosis
1. Check Google Cloud Status page for regional Firestore outages.
2. Run database connection test using liveness endpoint `/health`.

### Mitigation / Recovery
- **Dual-write Resiliency**: The system automatically attempts file-based local writes (`db.json`) if Firestore fails. Note that local container changes are ephemeral, but serve as an immediate buffer.
- **Scale down concurrent requests**: Limit traffic using API Gateway rate limiters to avoid DB connection pooling exhaustion.
