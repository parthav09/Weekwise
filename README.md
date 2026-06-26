# WeekWise

WeekWise is a personal planning app for turning tasks, habits, protected life time,
calendar events, and email follow-ups into realistic daily and weekly plans.

The project is built as a React/Vite frontend backed by a FastAPI API, SQLAlchemy
models, Alembic migrations, and PostgreSQL. It can run locally as separate
frontend/backend processes, or FastAPI can serve the compiled frontend from
`frontend/dist`.

## What The App Does

WeekWise is meant to answer a practical planning question: "What should my week
look like if I account for the work I owe, the habits I want to maintain, the
time I cannot use, and the messages that require follow-up?"

Current product areas:

- Dashboard: weekly progress, quick task entry, open task preview, habit progress,
  and pending Gmail task candidate count.
- Tasks: create, update, complete, move, filter, and delete tasks with priority,
  energy, category, estimated time, and schedule flexibility metadata.
- Habits: define weekly targets and log completions.
- Life Blocks: protect fixed or recurring time for sleep, workouts, classes,
  work, meals, commute, recovery, focus, and other recurring commitments.
- Planning: generate day or week plans from tasks, habits, life blocks, and
  external busy blocks.
- Saved Plans: persist generated plans, update saved plan item status, move plan
  items, and retain feedback reasons.
- Google Calendar: connect via OAuth, sync busy events into planning context, and
  export saved task/habit plan items back to Google Calendar.
- Gmail Inbox: connect Gmail, sync recent messages, extract task candidates with
  Gemini, then accept or reject candidates before they become real tasks.
- Notifications: manage in-app, email, and web-push preferences, create scheduled
  reminders for saved plan items, and dispatch due notifications through an API
  endpoint.

Authentication is not implemented yet. Local development uses a dev user and most
API requests default to `user_id=1`.

## Architecture

```text
Browser
  |
  | http://localhost:5173
  v
React + Vite + TypeScript frontend
  |
  | VITE_API_BASE_URL=http://localhost:8000/api
  v
FastAPI backend
  |
  | SQLAlchemy + psycopg
  v
PostgreSQL, commonly Supabase Postgres for local/project hosting
```

Optional external services:

```text
Gemini API       -> AI plan generation and Gmail task extraction
Google OAuth     -> Google Calendar and Gmail integrations
SMTP             -> Email notification dispatch
Web Push VAPID   -> Browser push notifications
```

If `GEMINI_API_KEY` is not configured, plan generation falls back to the
rule-based planner. Gmail task extraction requires Gemini to produce candidates.

## Tech Stack

```text
Frontend: React 18, TypeScript, Vite, Tailwind CSS, react-router-dom, lucide-react
Backend:  FastAPI, SQLAlchemy 2, Pydantic Settings, Alembic, psycopg
AI:       Google Gemini through google-genai
Database: PostgreSQL
```

## Requirements

```text
Python 3.11
Node.js 20
npm
PostgreSQL connection string
```

Supabase Postgres works well for local development because the backend accepts
standard URLs that start with `postgresql://` or `postgres://` and rewrites them
for SQLAlchemy's installed `psycopg` driver.

Example:

```env
DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
```

## Setup

### 1. Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set at least:

```env
DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Optional backend values:

```env
GEMINI_API_KEY=
AI_PLANNER_MODEL=gemini-2.5-flash

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/integrations/google-calendar/callback
GOOGLE_CALENDAR_SCOPES=openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events

GMAIL_REDIRECT_URI=http://localhost:8000/api/integrations/gmail/callback
GMAIL_SCOPES=openid email https://www.googleapis.com/auth/gmail.readonly
GMAIL_SYNC_LOOKBACK_DAYS=7
GMAIL_SYNC_MAX_MESSAGES=50
EMAIL_EXTRACTOR_MODEL=

FRONTEND_APP_URL=http://localhost:5173

NOTIFICATIONS_ENABLED=false
NOTIFICATION_DEFAULT_LEAD_MINUTES=10
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_CONTACT_EMAIL=
```

### 2. Run Backend

From `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"weekwise-backend"}
```

### 3. Run Frontend

From `frontend/`:

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

Keep the backend running in a separate terminal while using the Vite dev server.

The default frontend API setting is:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

### 4. Serve Built Frontend From FastAPI

For a single-process local run, build the frontend first:

```bash
cd frontend
npm install
npm run build
```

Then start the backend:

```bash
cd ../backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Open:

```text
http://localhost:8000
```

When `frontend/dist` exists, FastAPI serves static assets and lets React handle
routes such as `/today`, `/tasks`, `/inbox`, `/habits`, `/life-blocks`,
`/weekly-plan`, and `/settings`. API routes remain under `/api`.

## Migrations

Alembic reads the same `DATABASE_URL` as the backend.

Create a migration from `backend/`:

```bash
alembic revision --autogenerate -m "describe change"
```

Apply migrations:

```bash
alembic upgrade head
```

Check current migration:

```bash
alembic current
```

## Folder Structure

```text
WeekWise/
  frontend/
    src/
      components/
      pages/
      lib/
    package.json
    vite.config.ts
    tailwind.config.ts

  backend/
    app/
      main.py
      api/routes/
      core/
      integrations/
      models/
      schemas/
      services/
    alembic/
    requirements.txt

  README.md
```

## Current API Surface

Core:

```text
GET    /health
GET    /api/health
```

Tasks:

```text
POST   /api/tasks
GET    /api/tasks?due_from=YYYY-MM-DD&due_to=YYYY-MM-DD
GET    /api/tasks/{task_id}
PATCH  /api/tasks/{task_id}
DELETE /api/tasks/{task_id}
```

Habits:

```text
POST   /api/habits
GET    /api/habits
GET    /api/habits/completions
GET    /api/habits/{habit_id}
PATCH  /api/habits/{habit_id}
DELETE /api/habits/{habit_id}
POST   /api/habits/{habit_id}/completions
```

Life blocks:

```text
POST   /api/availability-blocks
GET    /api/availability-blocks?start_from=ISO&end_to=ISO
GET    /api/availability-blocks/{availability_block_id}
PATCH  /api/availability-blocks/{availability_block_id}
DELETE /api/availability-blocks/{availability_block_id}
```

Plans:

```text
POST   /api/plans/week
POST   /api/plans/day
POST   /api/plans/save
POST   /api/plans/week/save
POST   /api/plans/day/save
GET    /api/plans/saved
GET    /api/plans/saved/{plan_id}
PATCH  /api/plans/items/{item_id}
```

Google Calendar:

```text
GET    /api/integrations/google-calendar/status
GET    /api/integrations/google-calendar/connect
GET    /api/integrations/google-calendar/callback
POST   /api/integrations/google-calendar/sync
GET    /api/integrations/google-calendar/events
POST   /api/integrations/google-calendar/export-plan/{saved_plan_id}
```

Gmail:

```text
GET    /api/integrations/gmail/status
GET    /api/integrations/gmail/connect
GET    /api/integrations/gmail/callback
POST   /api/integrations/gmail/sync
DELETE /api/integrations/gmail/disconnect
GET    /api/integrations/gmail/candidates
POST   /api/integrations/gmail/candidates/{candidate_id}/accept
POST   /api/integrations/gmail/candidates/{candidate_id}/reject
```

Notifications:

```text
GET    /api/notifications/preferences
PATCH  /api/notifications/preferences/{channel}
GET    /api/notifications/web-push/public-key
GET    /api/notifications/web-push/subscriptions
POST   /api/notifications/web-push/subscribe
DELETE /api/notifications/web-push/{subscription_id}
GET    /api/notifications/scheduled
POST   /api/notifications/run-dispatch
```

## Current Data Model Areas

```text
User
Task
Habit
HabitCompletion
AvailabilityBlock / LifeBlock
GeneratedPlan
GeneratedPlanDay
GeneratedPlanItem
Google account and cached calendar events
External busy windows derived from cached calendar events
Email messages and extracted task candidates
Notification preferences, scheduled notifications, and web-push subscriptions
```

The app is still local-development oriented. Because authentication is not wired
in, user-scoped features use the dev user pattern instead of real account
ownership.

## Deployment Direction

A realistic production setup would be:

```text
weekwise.com        -> hosted frontend
api.weekwise.com    -> hosted FastAPI backend
PostgreSQL          -> managed Postgres, such as Supabase
Cloudflare          -> DNS and edge routing
Background worker   -> notification dispatch and scheduled sync jobs
```

Frontend production environment:

```env
VITE_API_BASE_URL=https://api.weekwise.com/api
```

Backend production environment:

```env
DATABASE_URL=postgresql://...
BACKEND_CORS_ORIGINS=https://weekwise.com,https://www.weekwise.com
FRONTEND_APP_URL=https://weekwise.com
```

## Recommended Next Product Steps

```text
1. Add authentication and replace the dev user flow with real user ownership.
2. Move notification dispatch and external sync into background jobs.
3. Add automated tests around planning, integrations, and saved-plan feedback.
4. Improve planner feedback loops so skipped, moved, and failed items influence future plans.
5. Harden OAuth, secrets, CORS, and deployment configuration for production.
```
