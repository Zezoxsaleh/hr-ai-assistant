# Project Roadmap

Master roadmap for the AI HR Recruitment Assistant. Status is tracked against
actual repository evidence, not file existence alone.

Legend: `COMPLETE` — implemented, tested, verified. `PARTIAL` — some elements
done, some missing. `MISSING` — not started / no implementation. `DEFERRED` —
intentionally postponed. `BLOCKED` — cannot proceed as specified (needs a
decision). `NOT STARTED` — not begun.

## Approved Statuses (from master audit, `docs/`-aligned)

> Objective evidence only — a phase is never "COMPLETE" merely because files
> exist. Where a phase has partial/stub endpoints but the phase spec (workflow,
> coverage, product behavior) is not implemented, it is marked accordingly.

| Phase | Name | Status |
|-------|------|--------|
| 0 | Repository & Documentation Alignment | PARTIAL (in progress; this file is part of it) |
| 1 | Backend Foundation & Project Setup | COMPLETE |
| 2 | Job Management & Candidate Profiles | PARTIAL |
| 3 | LLM Integration | MISSING |
| 4 | LangChain & LangGraph AI Agent Integration | MISSING |
| 5 | Agent Memory & LangSmith Observability | MISSING |
| 6 | Interview System | PARTIAL (frontend demo/placeholder only; no backend) |
| 7 | HR Chatbot | MISSING |
| 8 | Deterministic Evaluation & Scoring | COMPLETE (scoring locked v1.0) |
| 9 | Candidate Pool & Grouping | MISSING (marker endpoints exist; grouping/ranking workflow & UI not per spec) |
| 10 | HR Decisions | MISSING (POST create only; no list/decision workflow) |
| 11 | Observability & Traceability | MISSING (get-by-id only; no list/dashboard) |
| 12 | Reporting & Analytics | PARTIAL (client-side derived stats only) |
| 13 | Production Authentication & RBAC | MISSING (dev identity headers only) |
| 14 | AI Activity Monitoring | PARTIAL (traces exist; frontend is demo/placeholder) |
| 15 | Docker & Deployment | MISSING (compose runs Postgres dev DB only; no app image) |
| 16 | Production Hardening & Security | MISSING |
| 17 | Docs & Onboarding Complete | NOT STARTED (this roadmap/doc alignment is the start) |

### Current MVP Status (docs-aligned)

- **Core backend:** COMPLETE / MVP-ready — org/user identity (dev), job
  management, Job Profile extraction + HR approval gate, candidate management,
  CV upload + resume text extraction, candidate profiles, applications,
  evaluation, evidence, deterministic scoring, candidate pool, HR decisions
  (record), workflow/step/AI-trace observability records, REST API.
- **Frontend:** PARTIAL — canonical app at `frontend/frontend3/sandbox/` covers
  live flows; Interviews and AI-Activity pages are labeled demo/placeholder.
- **Real AI:** NOT YET — `FakeAIProvider` only; no LLM SDK installed.
- **Interviews:** DEFERRED/PARTIAL — UI mock only, no backend.
- **Chatbot:** NOT YET.
- **Production security:** NOT YET — dev identity headers only.
- **Docker deployment:** NOT YET — Postgres dev service only.

## Legacy / Reference Artifacts

These files are kept for reference and are NOT active architecture:

- `n8n_workflow.json` — legacy n8n CV-screening workflow sketch. Do not execute
  or wire into the product.
- `docs/HERA_system_flow.html` — visual / documentation artifact (HERA system
  flow). Not executable.
- `frontend/` subfolders other than `frontend/frontend3/sandbox/` — unmaintained
  experiment (week-1 mock prototype, legacy test frontend) and Figma-derived
  UI/UX design shells. Not canonical; not run.

## Cleanup Notes

- `backend/app/repositories/` and `backend/app/schemas/` are empty placeholder
  packages — REMOVE LATER (no imports reference them; real schemas live in
  `backend/app/api/v1/schemas/`).
- `backend/storage/` holds runtime-generated uploaded CVs and is git-ignored;
  do not commit its contents.