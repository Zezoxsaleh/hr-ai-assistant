# HERA — Recruitment System Frontend (Week 1)

React + Vite frontend for the Recruitment System. Talks to the FastAPI
backend through a service layer (`src/services/*.js`). By default it returns
mock data so the whole UI works. Set `VITE_USE_MOCK_DATA=false` to hit the
real backend for the endpoints it exposes; unsupported screens stay on mock.

## Stack
- React 19 + Vite
- React Router v7 (routing, protected routes)
- Axios (API client, in `src/services/apiClient.js`)
- Recharts (dashboard charts)
- lucide-react (icons)

## Getting started
```bash
npm install
npm run dev       # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # preview the production build
```

Login with **any** email/password — the backend has no login (it uses
header-based identity), so auth is a UI affordance only.

## Folder structure
```
src/
├── components/
│   ├── common/      # Badge, DataTable, LoadingSpinner, ProtectedRoute
│   ├── dashboard/    # StatCard
│   └── layout/       # Sidebar, Navbar
├── pages/
│   ├── auth/          # Login, Register, ForgotPassword
│   ├── dashboard/     # Dashboard (stats + charts)
│   ├── jobs/          # JobsList, CreateJob
│   ├── candidates/    # CandidatesList, CandidateDetails, ScreenCandidates
│   ├── applications/  # ApplicationsList
│   └── interviews/    # InterviewsList, ScheduleInterview
├── layouts/           # MainLayout (sidebar+navbar), AuthLayout
├── services/           # apiClient.js + one file per resource (auth, jobs, candidates, interviews, applications, dashboard)
├── context/            # AuthContext
├── hooks/               # useAuth
└── utils/               # mockData.js (single source of mock data)
```

## Switching from Mock Data to the real FastAPI backend
Every wired service in `src/services/*.js` looks like this:

```js
export async function getJobById(id) {
  if (USE_MOCK_DATA) {
    await delay();
    return jobsStore.find((j) => String(j.id) === String(id));
  }
  const { data } = await apiClient.get(`/jobs/${id}`);
  return data;
}
```

The backend authenticates via `X-Organization-Id` / `X-User-Id` headers (no
login/JWT) — they are read from `.env` and attached to every request.

To go live:
1. Set `VITE_USE_MOCK_DATA=false` in `.env`.
2. Set `VITE_API_BASE_URL` to the backend (default `http://localhost:8000/api/v1`).
3. Set `VITE_ORG_ID` and `VITE_USER_ID` to a valid org/user from the database.
4. For the Talent Pool screen, set `VITE_DEMO_JOB_ID` to an existing job id.

### What is wired to the backend vs. mocked
- **Wired (real when `USE_MOCK_DATA=false`):** Jobs create/view/update
  (`POST/GET/PATCH /jobs`), candidate detail (`GET /candidates/{id}`), and the
  Talent Pool (`GET /jobs/{id}/candidates` — Phase 4.5, job-scoped).
- **Mocked (always):** auth (no backend login), job/candidate **lists** (no
  list endpoint), applications, interviews, dashboard, analytics, AI activity,
  and CV screening (no simple endpoints). These return mock data regardless of
  the switch so the UI stays fully navigable.
- The backend job/candidate models are thinner than the UI's display model;
  wired services adapt the payloads so enriched UI-only fields are blank for
  real data.

No component code needs to change — pages only import from `services/`,
never call `axios`/`fetch` directly.

## Notes on the two existing prototypes
This project absorbs and restyles both of the standalone prototypes you had:
- `cv-screening-ui` → became `pages/candidates/ScreenCandidates.jsx`
  (job setup + PDF upload) plus `CandidatesList` / `CandidateDetails`.
  `services/candidateService.js` still supports posting straight to the
  n8n webhook (`VITE_CV_SCREENING_WEBHOOK_URL`) as a fallback if the
  ASP.NET endpoint isn't ready yet.
- `interview-schedule-ui-pro` → became `pages/interviews/ScheduleInterview.jsx`,
  restyled to match the dashboard theme instead of being a standalone page.
  `services/interviewService.js` keeps the n8n webhook fallback
  (`VITE_INTERVIEW_WEBHOOK_URL`) and the 409-conflict handling from the
  original component.

## Still to do (Week 2/3, per your plan)
- Replace mock auth with real ASP.NET Identity/JWT calls once available.
- Wire every service file to the real endpoints as the backend ships them.
- Add remaining CRUD screens (edit job, candidate status transitions, etc.)
- Testing pass (your QA role) once real data is flowing.
