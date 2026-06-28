#!/usr/bin/env bash
# ─── Guardian Core — Production Deploy Script (§26.1, §26.23) ─────────
#
# Automates the packaging, Registry pushes, Secret Manager bindings, 
# and Cloud Run provisioning for both API Gateway and Background Workers.
#
# Usage: ./deploy.sh --project <GCP_PROJECT_ID> [--region <REGION>] [--dry-run]

set -euo pipefail

# ─── Default Parameters ───────────────────────────────────────────────
REGION="us-central1"
PROJECT_ID=""
DRY_RUN=false
REPO_NAME="guardian-core"
SA_NAME="guardian-core-runner-sa"

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./deploy.sh --project <GCP_PROJECT_ID> [--region <REGION>] [--dry-run]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Error: --project <GCP_PROJECT_ID> is required."
  exit 1
fi

echo "================================================================="
echo "🚀 Starting Guardian Core Cloud Run Deployment"
echo "   Target Project : $PROJECT_ID"
echo "   Target Region  : $REGION"
echo "   Dry Run Mode   : $DRY_RUN"
echo "================================================================="

# ─── Environment Verification ──────────────────────────────────────────
if ! command -v gcloud &> /dev/null; then
  echo "❌ Error: gcloud SDK is not installed. Please install it to proceed."
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker is not running. Please start the Docker daemon."
  exit 1
fi

# ─── Step 1: Enable Google APIs ───────────────────────────────────────
if [ "$DRY_RUN" = false ]; then
  echo "⚙️ Enabling necessary Google Cloud APIs..."
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    firestore.googleapis.com \
    scheduler.googleapis.com \
    --project="$PROJECT_ID"
else
  echo "[Dry Run] Would enable Cloud Run, Artifact Registry, Secret Manager, Firestore, and Scheduler APIs."
fi

# ─── Step 2: Provision Runner Service Account ─────────────────────────
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if [ "$DRY_RUN" = false ]; then
  echo "👤 Checking Service Account: $SA_EMAIL..."
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    echo "Creating new Service Account: $SA_NAME..."
    gcloud iam service-accounts create "$SA_NAME" \
      --description="Runner service account for Guardian Core API and Workers" \
      --display-name="Guardian Core Runner" \
      --project="$PROJECT_ID"
  fi

  echo "🔑 Granting Datastore User permissions for Firestore access..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/datastore.user" \
    --quiet
else
  echo "[Dry Run] Would check/create service account $SA_EMAIL and bind Datastore User permissions."
fi

# ─── Step 3: Create Artifact Registry Repository ──────────────────────
REPO_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
if [ "$DRY_RUN" = false ]; then
  echo "📦 Verifying Artifact Registry Repository..."
  if ! gcloud artifacts repositories describe "$REPO_NAME" --project="$PROJECT_ID" --location="$REGION" &>/dev/null; then
    echo "Creating Repository: $REPO_NAME in region $REGION..."
    gcloud artifacts repositories create "$REPO_NAME" \
      --repository-format=docker \
      --location="$REGION" \
      --description="Guardian Core Container Registry" \
      --project="$PROJECT_ID"
  fi
else
  echo "[Dry Run] Would create/verify Artifact Registry: $REPO_NAME in $REGION."
fi

# ─── Step 4: Build and Push Docker Container ─────────────────────────
IMAGE_TAG="${REPO_PATH}/api:latest"
echo "🐳 Building Docker image: $IMAGE_TAG..."
if [ "$DRY_RUN" = false ]; then
  # Configure docker authentication
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker build -t "$IMAGE_TAG" .
  echo "📤 Pushing Docker image to Artifact Registry..."
  docker push "$IMAGE_TAG"
else
  echo "[Dry Run] Would configure docker auth, build container image, and push tag: $IMAGE_TAG."
fi

# ─── Step 5: Verify Secret Manager Configurations ─────────────────────
echo "🔐 Checking App Secrets in Secret Manager..."
SECRETS=("GEMINI_API_KEY" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "JWT_SECRET" "ENCRYPTION_KEY")
for SEC in "${SECRETS[@]}"; do
  if [ "$DRY_RUN" = false ]; then
    if ! gcloud secrets describe "$SEC" --project="$PROJECT_ID" &>/dev/null; then
      echo "  ⚠️ Warning: Secret '$SEC' does not exist in Secret Manager."
      echo "  Creating secret '$SEC' metadata structure..."
      gcloud secrets create "$SEC" --replication-policy="automatic" --project="$PROJECT_ID"
      echo "  🚨 Action Required: Please add a version for secret '$SEC' in GCP console or CLI:"
      echo "     echo -n 'value' | gcloud secrets versions add $SEC --data-file=-"
    fi
    # Bind Service Account permissions for reading
    gcloud secrets add-iam-policy-binding "$SEC" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" --quiet &>/dev/null
  else
    echo "[Dry Run] Would check/create secret '$SEC' and bind Secret Accessor permissions."
  fi
done

# ─── Step 6: Deploy Cloud Run API Service ──────────────────────────────
API_SERVICE_NAME="guardian-core-api-prod"
echo "🖥️ Deploying Backend API service..."
if [ "$DRY_RUN" = false ]; then
  gcloud run deploy "$API_SERVICE_NAME" \
    --image="$IMAGE_TAG" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --service-account="$SA_EMAIL" \
    --allow-unauthenticated \
    --port=3000 \
    --set-env-vars="NODE_ENV=production,DISABLE_WORKERS=true,ENABLE_SECRET_MANAGER=true,ENABLE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}" \
    --min-instances=0 \
    --max-instances=10 \
    --cpu=1 \
    --memory=512Mi
else
  echo "[Dry Run] Would deploy Cloud Run API service '$API_SERVICE_NAME' (min=0, max=10, cpu=1, memory=512Mi, workers disabled)."
fi

# ─── Step 7: Deploy Cloud Run Background Worker Service ────────────────
WORKER_SERVICE_NAME="guardian-core-worker-prod"
echo "⚙️ Deploying Background Worker service..."
if [ "$DRY_RUN" = false ]; then
  gcloud run deploy "$WORKER_SERVICE_NAME" \
    --image="$IMAGE_TAG" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --service-account="$SA_EMAIL" \
    --ingress=internal \
    --port=3000 \
    --set-env-vars="NODE_ENV=production,DISABLE_WORKERS=false,ENABLE_SECRET_MANAGER=true,ENABLE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}" \
    --min-instances=1 \
    --max-instances=3 \
    --cpu=1 \
    --memory=1024Mi \
    --no-cpu-throttling
else
  echo "[Dry Run] Would deploy Cloud Run Worker service '$WORKER_SERVICE_NAME' (min=1, max=3, cpu=1, memory=1024Mi, CPU unthrottled, workers enabled)."
fi

echo "================================================================="
if [ "$DRY_RUN" = false ]; then
  API_URL=$(gcloud run services describe "$API_SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
  echo "✅ Guardian Core successfully deployed!"
  echo "   API Endpoint URL: $API_URL"
  echo "   Health check status: $API_URL/health"
else
  echo "✅ Dry Run completed successfully!"
fi
echo "================================================================="
