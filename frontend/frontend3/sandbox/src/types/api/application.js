// JobApplication API contract.
// Source of truth: backend/app/api/v1/schemas/job_applications.py and
// backend/app/models/job_application.py (status CHECK constraint).

/**
 * Valid values for `JobApplicationResponse.status`.
 * @typedef {"created" | "analysis_pending" | "analyzing" | "analysis_failed" |
 *   "ready_for_review" | "hold" | "advanced" | "rejected" | "archived"}
 *   JobApplicationStatusValue
 */

/** DB-backed status vocabulary; do not invent additional statuses. */
export const JobApplicationStatus = Object.freeze({
  CREATED: "created",
  ANALYSIS_PENDING: "analysis_pending",
  ANALYZING: "analyzing",
  ANALYSIS_FAILED: "analysis_failed",
  READY_FOR_REVIEW: "ready_for_review",
  HOLD: "hold",
  ADVANCED: "advanced",
  REJECTED: "rejected",
  ARCHIVED: "archived",
});

/**
 * Request body for `POST /api/v1/job-applications`.
 * @typedef {object} JobApplicationCreate
 * @property {import("./common.js").UUID} job_id
 * @property {import("./common.js").UUID} candidate_id
 * @property {import("./common.js").UUID} resume_id
 */

/**
 * Response for application create/get and `GET /api/v1/jobs/{job_id}/applications`.
 * @typedef {object} JobApplicationResponse
 * @property {import("./common.js").UUID} id
 * @property {import("./common.js").UUID} organization_id
 * @property {import("./common.js").UUID} job_id
 * @property {import("./common.js").UUID} candidate_id
 * @property {import("./common.js").UUID} resume_id
 * @property {JobApplicationStatusValue} status
 * @property {import("./common.js").ISO8601DateTime} created_at
 * @property {import("./common.js").ISO8601DateTime} updated_at
 */

/**
 * JobApplication-supported API operations in the current backend.
 * @type {readonly ["create", "get", "listByJob"]}
 */
export const JOB_APPLICATION_OPERATIONS = Object.freeze([
  "create",
  "get",
  "listByJob",
]);