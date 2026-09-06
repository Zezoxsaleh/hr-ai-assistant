import apiClient from "./apiClient";
import { latestEvaluationScore } from "./evaluationsService";

// Application service backed by the real backend.
//
// The backend exposes applications per job (GET /jobs/{id}/applications) but
// has no org-wide application-list endpoint, so this service composes the
// Applications page from the real data sources:
//   GET /jobs                       -> all jobs (for the job title)
//   GET /jobs/{id}/applications     -> applications per job
//   GET /candidates/{id}            -> candidate full_name
//   GET /job-applications/{id}/evaluations -> latest evaluation score (string)
//
// Status uses the backend JobApplicationStatus vocabulary (src/types/api).

async function enrichApplication(app, jobTitle) {
  const [candidate, score] = await Promise.all([
    apiClient.get(`/candidates/${app.candidate_id}`).catch(() => ({ data: null })),
    latestEvaluationScore(app.id),
  ]);
  return {
    id: app.id,
    candidateId: app.candidate_id,
    candidateName: candidate.data?.full_name || "Unknown",
    job: jobTitle || app.job_id,
    appliedAt: app.created_at,
    score,
    status: app.status,
  };
}

export async function getApplications(status) {
  const { data: jobs } = await apiClient.get("/jobs");
  const jobList = Array.isArray(jobs) ? jobs : [];

  const byJob = await Promise.all(
    jobList.map(async (job) => {
      try {
        const { data } = await apiClient.get(`/jobs/${job.id}/applications`);
        return { jobTitle: job.title, apps: Array.isArray(data) ? data : [] };
      } catch (_err) {
        return { jobTitle: job.title, apps: [] };
      }
    })
  );

  const all = [];
  for (const { jobTitle, apps } of byJob) {
    for (const app of apps) {
      all.push(await enrichApplication(app, jobTitle));
    }
  }

  all.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  return status && status !== "all" ? all.filter((a) => a.status === status) : all;
}

export async function getApplicationById(id) {
  const { data } = await apiClient.get(`/job-applications/${id}`);
  return data;
}

export async function createApplication(payload) {
  const { data } = await apiClient.post("/job-applications", payload);
  return data;
}

export async function evaluateApplication(applicationId) {
  const { data } = await apiClient.post(`/job-applications/${applicationId}/evaluate`);
  return data;
}

export async function createDecision(applicationId, payload) {
  const { data } = await apiClient.post(`/job-applications/${applicationId}/decisions`, payload);
  return data;
}