# AI HR Recruitment Assistant

AI-powered HR Recruitment Assistant. The system reduces manual CV screening
effort while keeping HR in control of every consequential hiring decision.

**Status: pre-production MVP.** The core backend and the candidate review loop
work end-to-end with a live Soal LLM provider (`AI_PROVIDER=soal`, gateway
`https://soal.help/api/v1`, model `gemini-3.5-flash`) or with the deterministic
default `FakeAIProvider`. Production authentication, full reporting, and Docker
app deployment are planned and NOT yet implemented. See
[`docs/roadmap.md`](docs/roadmap.md).

## Repository Layout

- `backend/` — FastAPI application (Python, SQLAlchemy, Pydantic, Alembic).
- `frontend/frontend_last/` — **canonical active frontend** (React + Vite, zero
  mock data). This is the only maintained frontend.
- `frontend/app/` — minimal manual-test frontend (`npm run dev`, header-based
  identity), used for quick checks against the real backend; not the canonical UI.
- `frontend/frontend3/` (incl. `sandbox`) was the build base `frontend_last` was
  copied from and was **retired at the release checkpoint**. Other legacy
  `frontend/` folders are not the active frontend and are not executed.
- `tools/` — one-command PowerShell runbook scripts (start backend/frontend,
  test runners, the live E2E harness). See `AGENTS.md`.
- `docs/` — product requirements, architecture, AI contract schema, and roadmap.
- `docs/HERA_system_flow.html`, `n8n_workflow.json` — legacy/reference artifacts
  only. They are NOT executable application architecture and the product does
  not depend on them.

## Current Stack

- Frontend: React, Vite, Axios, React Router
- Backend: Python, FastAPI, SQLAlchemy, Pydantic, Alembic
- Database: PostgreSQL
- AI: `AIProvider` abstraction — `SoalProvider` (OpenAI-compatible, live) and
  a deterministic default `FakeAIProvider`, selected via `AI_PROVIDER`

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
- HERA Assistant chatbot (org-scoped threads, plan → authorized tools → compose)
- Interviews (schedule / cancel / feedback, interviewer selection)
- Interview Questions (banks + candidate-specific generated questions)
- AI-settings endpoint (provider/model/key-presence, no key leakage)
- REST API under `/api/v1`

## Current Limitations

- Real LLM integrated as an optional provider (`SoalProvider` via
  `https://soal.help/api/v1`); the deterministic `FakeAIProvider` is the code
  default when `AI_PROVIDER` is unset
- LangChain / LangGraph / LangSmith production integrations not yet completed
- Production authentication not yet implemented (development identity headers only)
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

Or use the runbook script (handles this machine's env quirks, restarts any
existing `:8000` listener, logs to `%TEMP%\opencode\backend.log`):

```powershell
tools\start_backend.ps1
```

Health check:

```text
GET /api/v1/health
```

## Run The Frontend

From `frontend/frontend_last/`:

```bash
npm install
npm run dev
```

Or use the runbook script (`tools\start_frontend.ps1 [port] [VITE_API_BASE_URL]`);
defaults to port 5174 and the production base URL. To run against the local
backend:

```powershell
tools\start_frontend.ps1 5174 http://localhost:8000/api/v1
```

The frontend expects the backend under `/api/v1` (see its `.env` /
`.env.example` for `VITE_API_BASE_URL`, `VITE_ORG_ID`, `VITE_USER_ID`).

## Tests And Checks

From `backend/`:

```bash
pytest
ruff check .
ruff format --check .
```

From `frontend/frontend_last/`:

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