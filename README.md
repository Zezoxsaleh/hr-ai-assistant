# AI HR Recruitment Assistant

This repository contains the AI-powered HR Recruitment Assistant.

Phase 1 establishes the backend foundation only. It does not include AI, LangChain, LangGraph, agents, authentication, resume parsing, matching, scoring, email, or calendar integrations.

## Backend Setup

From the repository root:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
```

Copy the example environment file if needed:

```bash
copy .env.example .env
```

## Database

Start the local PostgreSQL service from the repository root:

```bash
docker compose up -d postgres
```

The backend reads the database connection from `DATABASE_URL`.

## Run The Backend

From `backend/`:

```bash
uvicorn app.main:app --reload
```

Health check:

```text
GET /api/v1/health
```

## Tests And Checks

From `backend/`:

```bash
pytest
ruff check .
ruff format --check .
```

## Migrations

From `backend/`, apply migrations after PostgreSQL is running:

```bash
alembic upgrade head
```

Downgrade the latest migration:

```bash
alembic downgrade -1
```
