# Guardian Core
### *The Autonomous AI Chief of Staff for Proactive Goal Completion and Time Governance*

Guardian Core is a next-generation, AI-first productivity companion designed to bridge the gap between planning and execution. Operating like an intelligent, highly context-aware Chief of Staff, Guardian Core doesn't just remind you of a deadline—it actively helps you meet it. 

By combining a sophisticated multi-agent cognitive architecture with deep integrations into the Google ecosystem (Google Calendar, Google Tasks, Gmail, and Firestore), Guardian Core dynamically decomposes complex goals, resolves scheduling conflicts, adapts to user behavior, and continuously refines its assistance through a closed-loop learning system.

---

## 🚀 Key Features

*   **Natural Language Goal Formulation:** Input complex, multi-week goals in plain natural language. The AI parses the underlying intent, target dates, and constraints.
*   **Intelligent Milestone Generation:** Automatically decomposes large goals into structured, chronological milestones with individual intermediate deadlines.
*   **Dynamic Calendar Conflict Detection & Auto-Rescheduling:** Continuously monitors your Google Calendar. When a conflict is detected, the system automatically calculates new, optimal times for displaced work and updates your calendar.
*   **Personalized Scheduling & Preference Learning:** Analyzes when you complete tasks, when you snooze reminders, and when you reschedule work to build a personalized behavioral profile.
*   **Asset Drafting Co-pilot:** Gets immediate draft structures, research papers, email drafts, or starter code.
*   **Continuous Reflection & Improvement:** Periodically reflects on past performance to identify chronic bottlenecks and adjust future time estimates.

---

## 🛠️ Architecture & Multi-Agent System

Guardian Core distributes cognitive responsibilities across several specialized AI agents collaborating through a centralized coordinator:

*   **Understanding Agent:** Parses user inputs, extracts semantic intent, and identifies implicit deadlines.
*   **Planning Agent:** Generates logical, chronological milestone paths and estimates task effort.
*   **Decision Agent:** Evaluates proposed actions against the user’s chosen autonomy level (Advisory, Delegated, or Autonomous).
*   **Memory Agent:** Manages long-term user preferences, past goal histories, and successful behavioral patterns.
*   **Negotiation Agent:** Resolves scheduling conflicts between calendar constraints and goal deadlines.
*   **Reflection Agent:** Analyzes completed goals to calculate time-estimation drift and update the user's cognitive profile.
*   **Execution Agent:** Translates agent decisions into concrete Google API calls.

---

## 💻 Tech Stack & Google Cloud Integrations

*   **AI Engine:** Gemini API (using Gemini 3.5 Flash for rapid, structured reasoning).
*   **Database:** Google Cloud Firestore (Native Mode) for real-time document persistence.
*   **Authentication:** Google OAuth 2.0.
*   **Integrations:** Google Calendar API, Google Tasks API, Gmail API.
*   **Hosting:** Google Cloud Run (Frontend static Express server + Backend Express API and Background Worker Engine).

---

## ⚙️ Running Locally

### Prerequisites
*   [Node.js](https://nodejs.org/) (v20 or higher)
*   A Google Cloud Project with the Gemini API enabled (or a Gemini API Key from Google AI Studio).

### Setup Instructions

1.  **Clone the repository and install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment Variables:**
    Create a `.env` file in the `backend/` directory using the provided template:
    ```bash
    cp backend/.env.example backend/.env
    ```
    Configure your `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.

    Create a `.env` file in the `frontend/` directory:
    ```bash
    cp frontend/.env.example frontend/.env
    ```

3.  **Run the application in development mode:**
    ```bash
    npm run dev
    ```
    The frontend will be available at `http://localhost:5173` and the backend at `http://localhost:3000`.

---

## 🚀 Deployment

The project is configured for automated deployment via GitHub Actions [.github/workflows/deploy.yml](.github/workflows/deploy.yml) to **Google Cloud Run**.

For a detailed deployment guide including Google Secret Manager, OAuth redirect URI configuration, and service account IAM roles, please refer to the **[GCP Deployment Guide](docs/gcp_deployment_guide.md)**.
