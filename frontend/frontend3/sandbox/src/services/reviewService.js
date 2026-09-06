import apiClient from "./apiClient";
import { getApplicationById, evaluateApplication, createDecision } from "./applicationService";
import { getEvaluationById, getEvaluationEvidence, listEvaluationsByApplication } from "./evaluationsService";
import { getJobById } from "./jobService";
import { getCandidateById } from "./candidateService";

// Review-flow service (Phase 1). Orchestrates everything the HR review screen
// needs from the real backend:
//   GET  /job-applications/{id}                      application context
//   GET  /candidates/{id}                            candidate context
//   GET  /jobs/{id}                                  job context (title)
//   GET  /job-applications/{id}/evaluations          evaluation versions
//   GET  /evaluations/{id}                           current evaluation detail
//   GET  /evaluations/{id}/evidence                  requirement evidence
//   GET  /jobs/{id}/candidates                       pool frame (group + decision)
//   POST /job-applications/{id}/evaluate             creates an evaluation run
//   POST /job-applications/{id}/decisions            records an HR decision
//
// Invariants (master-mission contract):
//   - The backend CandidateEvaluationWorkflow is the ONLY source of evaluation
//     creation; this service never fabricates a score or an evaluation object.
//   - Only the HRDecisionCreate payload { decision, reason } is ever submitted.
//   - Score/group are displayed as returned; never computed client-side.

// The pool summary (JobCandidateSummary) is the backend's own read model for
// score, group, decision and decision_created_at read back after a POST.
export async function getPoolFrame(jobId) {
  try {
    const { data } = await apiClient.get(`/jobs/${jobId}/candidates`);
    return Array.isArray(data) ? data : [];
  } catch (_err) {
    return [];
  }
}

// One call for the full review screen. Context entities are best-effort:
// candidate/job are display-only, so a failure there does not block the page.
export async function getReviewBundle(applicationId) {
  const app = await getApplicationById(applicationId);
  const evaluations = await listEvaluationsByApplication(applicationId);
  const currentEvaluation =
    evaluations.find((e) => e.is_current) || evaluations[evaluations.length - 1] || null;

  const [candidate, job, evaluation, evidence, poolFrame] = await Promise.all([
    getCandidateById(app.candidate_id).catch(() => null),
    getJobById(app.job_id).catch(() => null),
    currentEvaluation ? getEvaluationById(currentEvaluation.id) : Promise.resolve(null),
    currentEvaluation ? getEvaluationEvidence(currentEvaluation.id) : Promise.resolve([]),
    getPoolFrame(app.job_id),
  ]);

  const poolRow = poolFrame.find((r) => r.application_id === applicationId) || null;

  return {
    application: app,
    candidate,
    job,
    evaluations,
    evaluation,
    evidence,
    poolRow,
  };
}

// Runs a synchronous backend evaluation run and returns the run result
// ({ evaluation_id, workflow_run_id, version_number }); the page refetches the
// evaluation + evidence afterwards.
export async function runEvaluation(applicationId) {
  return evaluateApplication(applicationId);
}

// Records an HR decision through the backend DecisionService API. Only the
// decision vocabulary from src/types/api/decision.js is valid, and only
// { decision, reason } is transmitted.
export async function recordDecision(applicationId, decision, reason) {
  const payload = { decision, reason: (reason || "").trim() || undefined };
  return createDecision(applicationId, payload);
}