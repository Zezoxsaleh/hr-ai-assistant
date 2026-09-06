import apiClient from "./apiClient";

// Candidate service. Contract: src/types/api/candidate.js.
//
// The backend has no org-wide candidate list, so the list is backed by the
// job-scoped candidate pool (GET /jobs/{id}/candidates). Single-candidate
// reads hit GET /candidates/{id}.

// Maps a JobCandidateSummary (pool row) onto the candidate display model.
// score comes back as a STRING ("85.000") — the client renders a rounded
// number but never computes groups (the backend assigns `group` itself).
function mapPoolRowToCandidate(row) {
  const rawScore = Number(row.score);
  const score = Number.isFinite(rawScore) ? Math.round(rawScore) : 0;
  return {
    id: row.candidate_id,
    name: row.full_name || "Unknown",
    email: row.email || "",
    phone: row.phone || "",
    score,
    status: row.status || "active",
    decision: row.decision || "",
    group: row.group || "",
    title: "",
    experience: "",
    matching: [],
    missing: [],
    strengths: [],
    reason: "",
    projects: [],
    education: "",
    links: {},
    cv: "",
  };
}

function adaptFromBackend(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.full_name,
    email: c.email || "",
    phone: c.phone || "",
    status: c.status,
    title: "",
    skills: [],
    score: 0,
    matching: [],
    missing: [],
    strengths: [],
    reason: "",
    projects: [],
    education: "",
    lastInteraction: "",
    appliedAt: c.created_at,
  };
}

// `params` become the backend CandidatePoolQuery: status, search, group,
// decision, min_score, max_score.
export async function getCandidates(params = {}) {
  const jobId = params.jobId || import.meta.env.VITE_DEMO_JOB_ID;
  if (!jobId) {
    throw new Error("Set VITE_DEMO_JOB_ID to load the job candidate pool.");
  }
  const query = {};
  if (params.status) query.status = params.status;
  if (params.decision) query.decision = params.decision;
  if (params.group) query.group = params.group;
  if (params.search) query.search = params.search;
  if (params.min_score !== undefined) query.min_score = params.min_score;
  if (params.max_score !== undefined) query.max_score = params.max_score;
  const { data } = await apiClient.get(`/jobs/${jobId}/candidates`, { params: query });
  return (Array.isArray(data) ? data : []).map(mapPoolRowToCandidate);
}

export async function getCandidateById(id) {
  const { data } = await apiClient.get(`/candidates/${id}`);
  return adaptFromBackend(data);
}

// Runs the backend's full CV-screening workflow for a job + uploaded PDFs:
// candidate + resume upload + candidate profile extraction + job application
// + evaluation for every uploaded CV.
export async function screenCandidates({ jobId, files }) {
  if (!jobId) {
    throw new Error("A job must be selected before screening can start.");
  }
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file, file.name);
  }
  const { data } = await apiClient.post(`/jobs/${jobId}/screen`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}