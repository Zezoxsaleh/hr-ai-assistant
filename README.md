# AI HR Recruitment Assistant

AI-powered HR Recruitment Assistant. The system reduces manual CV screening
effort while keeping HR in control of every consequential hiring decision.

**Status: pre-production MVP.** The core backend and the candidate review loop
work end-to-end with deterministic (fake) AI. Real LLM integration, production
authentication, interviews, chatbot, reporting, observability service, and
Docker deployment are planned and NOT yet implemented. See
[`docs/roadmap.md`](docs/roadmap.md).

## Repository Layout

- `backend/` — FastAPI application (Python, SQLAlchemy, Pydantic, Alembic).
- `frontend/frontend3/sandbox/` — **canonical active frontend** (React + Vite).
  This is the only maintained frontend.
- `frontend/app/`, `frontend/sandbox/`, `frontend/Finalize UI_UX Design/` —
  **legacy/unmaintained** experiment and design folders. They are not the active
  frontend, not wired into anything, and not executed.
- `docs/` — product requirements, architecture, AI contract schema, and roadmap.
- `docs/HERA_system_flow.html`, `n8n_workflow.json` — legacy/reference artifacts
  only. They are NOT executable application architecture and the product does
  not depend on them.

## Current Stack

- Frontend: React, Vite, Axios, React Router
- Backend: Python, FastAPI, SQLAlchemy, Pydantic, Alembic
- Database: PostgreSQL
- AI: `AIProvider` abstraction with a deterministic `FakeAIProvider`

## Current Capabilities

- Organization- and user-scoped identity (development only, via `X-Organization-Id` / `X-User-Id` headers)
- Job management (CRUD, structured fields)
- Job Profile extraction + versioning + HR approval gate
- Candidate management, CV upload, resume text extraction (PDF/DOCX)
- Candidate Profile extraction
- Job applications
- Candidate evaluation workflow
- Requirement-level match evidence
- Deterministic scoring (locked semantics, scoring version 1.0)
- Score breakdown + candidate ranking + Candidate Pool (search/filter/group)
- HR decisions: advance / hold / reject
- Workflow / step / AI trace observability records
- REST API under `/api/v1`

## Current Limitations

- Real LLM not yet integrated (`FakeAIProvider` is used for everything)
- LangChain / LangGraph / LangSmith production integrations not yet completed
- Production authentication not yet implemented (development identity headers only)
- Interview workflow incomplete (frontend shows a demo/placeholder)
- HR chatbot not yet built
- Reporting incomplete (dashboard/analytics are derived client-side only)
- Docker deployment not yet built (only the Postgres compose service exists)

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

## Run The Frontend

From `frontend/frontend3/sandbox/`:

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000` (see its `.env` /
`.env.example` for `VITE_API_BASE_URL`, `VITE_ORG_ID`, `VITE_USER_ID`).

## Tests And Checks

From `backend/`:

```bash
pytest
ruff check .
ruff format --check .
```

From `frontend/frontend3/sandbox/`:

```bash
npm run lint
npm run build
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