# ─── Google Cloud Infrastructure Configuration (ADR-024) ───────────────

terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── Input Variables ──────────────────────────────────────────────────
variable "project_id" {
  type        = string
  description = "The target Google Cloud Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Target deployment region"
}

variable "artifact_registry_name" {
  type        = string
  default     = "guardian-core"
  description = "Docker artifact registry name"
}

# ─── Artifact Registry ────────────────────────────────────────────────
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.artifact_registry_name
  description   = "Docker registry for Guardian Core container images"
  format        = "DOCKER"
}

# ─── IAM: Least Privilege Service Account ─────────────────────────────
resource "google_service_account" "runner_sa" {
  account_id   = "guardian-core-runner-sa"
  display_name = "Least Privilege Runner Service Account for Guardian Core"
}

# Grant Datastore permissions for Firestore Dual-Writes (§19)
resource "google_project_iam_member" "firestore_access" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runner_sa.email}"
}

# ─── Secret Manager Configuration (§26.14) ─────────────────────────────
locals {
  app_secrets = [
    "GEMINI_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "JWT_SECRET",
    "ENCRYPTION_KEY"
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.app_secrets)
  secret_id = each.key
  replication {
    auto {}
  }
}

# Grant runner service account access to Secret Manager
resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each  = toset(local.app_secrets)
  secret_id = google_secret_manager_secret.secrets[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner_sa.email}"
}

# ─── Cloud Run: Backend API Service ────────────────────────────────────
resource "google_cloud_run_v2_service" "api_service" {
  name     = "guardian-core-api-prod"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runner_sa.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_name}/api:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1.0"
          memory = "512Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DISABLE_WORKERS"
        value = "true"
      }
      env {
        name  = "ENABLE_SECRET_MANAGER"
        value = "true"
      }
      env {
        name  = "ENABLE_FIRESTORE"
        value = "true"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT_ID"
        value = var.project_id
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Make API service publicly accessible
resource "google_cloud_run_service_iam_member" "api_public" {
  service  = google_cloud_run_v2_service.api_service.name
  location = google_cloud_run_v2_service.api_service.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Cloud Run: Background Worker Service ──────────────────────────────
resource "google_cloud_run_v2_service" "worker_service" {
  name     = "guardian-core-worker-prod"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL"

  template {
    service_account = google_service_account.runner_sa.email

    # Keep CPU always allocated so Sentinel / Learning schedules run continuously
    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_name}/api:latest"

      ports {
        container_port = 3000
      }

      resources {
        cpu_idle = false # Keep CPU active for timers
        limits = {
          cpu    = "1.0"
          memory = "1024Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DISABLE_WORKERS"
        value = "false"
      }
      env {
        name  = "ENABLE_SECRET_MANAGER"
        value = "true"
      }
      env {
        name  = "ENABLE_FIRESTORE"
        value = "true"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT_ID"
        value = var.project_id
      }
    }
  }
}

# ─── Cloud Scheduler: Warm-up & Trigger Job ───────────────────────────
resource "google_cloud_scheduler_job" "liveness_trigger" {
  name             = "guardian-core-warm-trigger-job"
  description      = "Queries health status check to warm up API and keep server hot"
  schedule         = "*/15 * * * *" # Every 15 minutes
  time_zone        = "Etc/UTC"
  attempt_deadline = "180s"

  http_target {
    http_method = "GET"
    uri         = "${google_cloud_run_v2_service.api_service.uri}/health"
  }
}
