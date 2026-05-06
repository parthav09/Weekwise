# WeekWise

WeekWise is an AI-assisted weekly planning app with a React/Vite frontend, FastAPI backend, SQLAlchemy models, Alembic migrations, and a Supabase-hosted PostgreSQL database.

This project does not include authentication, AI planning, API gateways, background workers, external integrations, or deployment automation yet.

## Architecture

```text
Browser
  |
  | http://localhost:5173
  v
React + Vite frontend
  |
  | VITE_API_BASE_URL=http://localhost:8000/api
  v
FastAPI backend
  |
  | SQLAlchemy + psycopg
  v
Supabase PostgreSQL
```

Local development runs the frontend and backend directly on your machine. The database is Supabase Postgres, configured through one backend environment variable:

```env
DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
```

The backend accepts standard Supabase/Postgres URLs that start with `postgresql://` or `postgres://` and automatically routes them through the installed SQLAlchemy `psycopg` driver.

## Requirements

```text
Python 3.11
Node.js 20
npm
Supabase project with a Postgres connection string
```

Runtime version files:

```text
backend/.python-version -> 3.11
frontend/.nvmrc         -> 20
```

## Setup

### 1. Configure Supabase

Create a Supabase project, copy its Postgres connection string, and put it in `backend/.env`:

```bash
cd backend
cp .env.example .env
```

Then replace the placeholder `DATABASE_URL` value with your Supabase Postgres URL.

### 2. Start Backend For Local Development

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

Expected:

```json
{"status":"ok","service":"weekwise-backend"}
```

### 3. Start Frontend

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

### 4. Build Frontend Into Backend Hosting Mode

For a single-process setup where FastAPI serves the compiled React app, build the
frontend first:

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

FastAPI serves `frontend/dist` when it exists. React routes such as `/tasks`,
`/habits`, `/weekly-plan`, and `/settings` are handled by the frontend, while API
routes are available under `/api`.

## Environment Variables

Backend local environment values live in:

```text
backend/.env
```

Template:

```text
backend/.env.example
```

Backend variables:

```env
DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Frontend local environment values can live in:

```text
frontend/.env
```

Template:

```text
frontend/.env.example
```

Frontend variables:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

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
        ui/
      pages/
      lib/
    package.json
    tailwind.config.ts
    vite.config.ts

  backend/
    app/
      main.py
      api/
        routes/
      core/
        config.py
        database.py
      models/
      schemas/
      services/
    alembic/
    requirements.txt

  README.md
  .gitignore
```

## Current API

```text
GET  /health
GET  /api/health
POST /api/tasks
GET  /api/tasks?due_from=YYYY-MM-DD&due_to=YYYY-MM-DD
GET  /api/tasks/{task_id}
PATCH /api/tasks/{task_id}
DELETE /api/tasks/{task_id}
POST /api/habits
GET  /api/habits
GET  /api/habits/{habit_id}
PATCH /api/habits/{habit_id}
DELETE /api/habits/{habit_id}
GET  /api/habits/completions
POST /api/habits/{habit_id}/completions
POST /api/availability-blocks
GET  /api/availability-blocks
GET  /api/availability-blocks/{availability_block_id}
POST /api/plans/week
POST /api/plans/day
POST /api/plans/save
POST /api/plans/week/save
POST /api/plans/day/save
GET  /api/plans/saved
GET  /api/plans/saved/{plan_id}
PATCH /api/plans/items/{item_id}
```

Authentication is not implemented yet. Create requests accept `user_id`, defaulting to `1`, for local development only.

## Current Data Models

```text
User
- id
- name
- email
- created_at
- updated_at

Task
- id
- user_id
- title
- description (optional notes)
- priority: low | medium | high | urgent
- status: todo | in_progress | done
- due_date (deadline / planned day)
- estimated_minutes
- energy_level: low | medium | high
- category: school | work | fitness | social | errands | personal
- schedule_flexibility: flexible | fixed
- completed_at
- created_at
- updated_at

Habit
- id
- user_id
- title
- target_count_per_week: minimum 4
- estimated_minutes
- preferred_time_of_day
- created_at
- updated_at

HabitCompletion
- id
- habit_id
- user_id
- note
- completed_on: unique per habit
- completed_at
- created_at

AvailabilityBlock
- id
- user_id
- title
- block_type: available | blocked | recovery
- start_time
- end_time
- recurrence_rule
- created_at
- updated_at

GeneratedPlan
- id
- user_id
- scope: day | week
- generator: rules | ai
- start_at
- end_at
- notes
- plan_payload
- created_at
- updated_at

GeneratedPlanItem
- id
- generated_plan_id
- generated_plan_day_id
- title
- item_type: task | habit | life
- source_id
- start_at
- end_at
- status: planned | done | skipped | moved | failed
- feedback_reason
- moved_to_start
- moved_to_end
- metadata
- created_at
- updated_at
```

## Deployment Direction

A realistic production setup for this app would be:

```text
weekwise.com        -> hosted frontend
api.weekwise.com    -> hosted FastAPI backend
PostgreSQL          -> Supabase
Cloudflare          -> DNS
```

The frontend should use:

```env
VITE_API_BASE_URL=https://api.weekwise.com/api
```

The backend should use production database credentials and CORS origins:

```env
DATABASE_URL=postgresql://...
BACKEND_CORS_ORIGINS=https://weekwise.com,https://www.weekwise.com
```

## Recommended Next Product Steps

```text
1. Use saved-plan feedback to improve future planning suggestions.
2. Add authentication.
3. Scope all data to authenticated users.
4. Add planner analytics once enough feedback exists.
5. Add external integrations after the core loop is reliable.
```
