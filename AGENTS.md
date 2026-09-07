# AGENTS.md

Repository for the AI HR Recruitment Assistant. Candidate review loop is
implemented end-to-end with a deterministic `FakeAIProvider`; work is in
`backend/` and `frontend/frontend3/sandbox/`. See [`docs/roadmap.md`](docs/roadmap.md)
for phase status. This is a **pre-production MVP**: no real LLM, no production
auth, no interviews, no chatbot, no Docker app deployment yet.

## Process rules (required reading)

Read `docs/development-rules.md` and follow it. It mandates
`PLAN -> APPROVAL -> IMPLEMENT -> TEST -> REVIEW -> COMMIT`, forbids writing code
before approval, forbids touching unrelated files, and forbids new
frameworks/architecture without approval. `docs/architecture.md` documents
intended design decisions that are intentionally not yet finalized (LLM
provider, LangGraph wiring). Do not implement those without explicit
instruction.

## Command rules

- Backend commands run from **`backend/`**.
- Frontend commands run from **`frontend/frontend3/sandbox/`** (the only
  canonical frontend; the other `frontend/` folders are legacy and are never
  executed as the app).
- Never wire or run `n8n_workflow.json` and never treat `docs/HERA_system_flow.html`
  as runtime architecture — both are legacy/reference artifacts.

## Backend commands (run from `backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest                 # needs Postgres running (see below)
ruff check .
ruff format --check .
alembic upgrade head   # after Postgres is up
uvicorn app.main:app --reload
```

Lint uses ruff with `E F I UP B` rules, line length 100, double quotes
(`pyproject.toml`).

## Frontend commands (run from `frontend/frontend3/sandbox/`)

```bash
npm install
npm run dev            # dev server (Vite)
npm run lint           # oxlint
npm run build          # production build
```

## Database and test gotchas

- Start Postgres first: `docker compose up -d postgres` from repo root (image
  `postgres:16-alpine`, creds `hr_ai_assistant`/`hr_ai_assistant`, port 5432).
  That compose file is the local dev DB only — it is not the app's Docker
  deployment.
- Config is loaded from `backend/.env` via `app/core/config.py`
  (pydantic-settings). Copy `backend/.env.example` to `backend/.env` if absent.
  Defaults already match the compose DB, so it usually runs with no env file.
- `DATABASE_URL` is the app DB; **`TEST_DATABASE_URL` is a separate DB**
  (`..._test`). Tests DO NOT use `TEST_DATABASE_URL` directly against your data
  — `tests/conftest.py` auto-creates the test DB if missing and drops/recreates
  all tables per session. Keep the two URLs pointing at different databases; a
  test run will wipe the DB named in `TEST_DATABASE_URL`.
- `tests/conftest.py` imports `from app import models` so all models register on
  `Base.metadata`. When you add a model, keep it imported into
  `app/models/__init__.py`.
- Alembic `env.py` pulls connection from `settings.database_url` and
  autogenerates against `Base.metadata`. **Revision IDs must stay under 32
  chars** (the `alembic_version.version_num` column width). Current head:
  `007_job_structured_fields`.

## Layout

- `backend/app/` — FastAPI app. Entrypoint `app/main.py` (`create_app()`),
  router at `app/api/v1/router.py`, settings `app/core/config.py`, engine
  `app/core/database.py`.
- `backend/app/models/` — SQLAlchemy ORM models; Pydantic schemas live under
  `backend/app/api/v1/schemas/` (the top-level `backend/app/schemas/` package is
  an empty placeholder to be removed later). `backend/app/services/` holds
  business logic; `backend/app/repositories/` is an empty placeholder to be
  removed later.
- `backend/alembic/versions/` — numbered migrations (`00x_*.py`).
- `frontend/frontend3/sandbox/` — canonical React/Vite frontend (pages, services,
  components). Interview and AI-Activity pages are demo/placeholder UI; the rest
  calls the live backend.
- `frontend/app/`, `frontend/sandbox/`, `frontend/Finalize UI_UX Design/` —
  legacy/unmaintained experiment and design folders, not the canonical app.
- `backend/storage/` — runtime-generated uploads (uploaded CVs); ignored by git,
  not source.