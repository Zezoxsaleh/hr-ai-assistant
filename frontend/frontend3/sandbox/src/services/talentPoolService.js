import apiClient from "./apiClient";

// Talent-pool service. Contract: src/types/api/candidate.js (pool + query).
// The pool rows are the job-scoped candidates (GET /jobs/{id}/candidates)
// mapped onto the page's display model.

const GROUP_TO_EVAL = {
  must_review: "Recommend Interview",
  consider: "Hold for Review",
  lower_priority: "Review Later",
};

function mapBackendRow(row) {
  return {
    id: row.application_id || row.candidate_id,
    name: row.full_name || "Unknown",
    email: row.email || "",
    previousJob: row.title || "—",
    previousEvaluation: GROUP_TO_EVAL[row.group] || row.group || "Review",
    skills: [],
    potentialRoles: [],
    score: row.score ?? "—",
    group: row.group,
    status: row.status,
    decision: row.decision || "—",
    lastContactDaysAgo: 0,
    reengaged: false,
  };
}

// `params` become the backend CandidatePoolQuery (status, decision, group,
// search, min_score, max_score). A job id is required; use params.jobId or
// VITE_DEMO_JOB_ID.
export async function getTalentPool(params = {}) {
  const jobId = params.jobId || import.meta.env.VITE_DEMO_JOB_ID;
  if (!jobId) {
    throw new Error("Set VITE_DEMO_JOB_ID to load the candidate pool.");
  }

  const query = {};
  if (params.status) query.status = params.status;
  if (params.decision) query.decision = params.decision;
  if (params.group) query.group = params.group;
  if (params.search) query.search = params.search;
  if (params.min_score !== undefined) query.min_score = params.min_score;
  if (params.max_score !== undefined) query.max_score = params.max_score;

  try {
    const { data } = await apiClient.get(`/jobs/${jobId}/candidates`, { params: query });
    return (Array.isArray(data) ? data : []).map(mapBackendRow);
  } catch (_err) {
    // Unknown job id (reseeded DB) or a down backend: show an empty pool
    // instead of an unhandled request failure.
    return [];
  }
}

// No dedicated AI-discovery endpoint exists; the page's banner stays hidden.
export async function getAIDiscovery() {
  return null;
}

// No backend re-engagement endpoint exists yet. Return the record untouched.
export async function reengageCandidate(id) {
  return { id, reengaged: false, note: "Re-engagement is not supported by the backend yet." };
}