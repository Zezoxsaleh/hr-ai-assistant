import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock3,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { HRDecisionValue } from "../../types/api";
import {
  getReviewBundle,
  runEvaluation,
  recordDecision,
} from "../../services/reviewService";

const GROUP_LABELS = {
  must_review: "Must Review",
  consider: "Consider",
  lower_priority: "Lower Priority",
};

const GROUP_TONE = {
  must_review: "green",
  consider: "amber",
  lower_priority: "grey",
};

const DECISION_LABELS = {
  [HRDecisionValue.ADVANCE]: "Advance",
  [HRDecisionValue.HOLD]: "Place on hold",
  [HRDecisionValue.REJECT]: "Reject",
};

const DECISION_TONE = {
  [HRDecisionValue.ADVANCE]: "green",
  [HRDecisionValue.HOLD]: "amber",
  [HRDecisionValue.REJECT]: "red",
};

const DECISION_ICON = {
  [HRDecisionValue.ADVANCE]: CheckCircle2,
  [HRDecisionValue.HOLD]: Clock3,
  [HRDecisionValue.REJECT]: XCircle,
};

function normalizeStatus(status) {
  return String(status || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractError(err) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  return "The operation failed. Please try again.";
}

function scoreDisplay(raw) {
  if (raw === undefined || raw === null) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return String(Math.round(n));
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch (_err) {
    return String(ts);
  }
}

function EvaluationOverview({ evaluation }) {
  const score = Number(evaluation.score);
  const scoreNum = Number.isFinite(score) ? Math.round(score) : null;
  return (
    <>
      <div className="overall-score-row">
        <span>Overall Score</span>
        <strong>{scoreDisplay(evaluation.score)}%</strong>
      </div>
      {scoreNum !== null && (
        <div className="score-track">
          <i style={{ width: `${scoreNum}%` }} />
        </div>
      )}
    </>
  );
}

function ScoreBreakdownTable({ breakdown }) {
  const rows = breakdown ? Object.values(breakdown) : [];
  if (!rows.length) {
    return <p className="muted-note">No per-requirement breakdown available.</p>;
  }
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Category</th>
              <th>Weight</th>
              <th>Evidence</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const evidenceType = row.evidence_type || "missing";
              const chip =
                evidenceType === "matched"
                  ? "chip good"
                  : evidenceType === "partial"
                  ? "chip"
                  : "chip bad";
              return (
                <tr key={row.requirement_key || row.label}>
                  <td>{row.text || row.label || row.requirement_key}</td>
                  <td className="muted-note">
                    {normalizeStatus(row.category)}
                  </td>
                  <td className="muted-note">{row.weight}</td>
                  <td>
                    <span className={chip}>{normalizeStatus(evidenceType)}</span>
                  </td>
                  <td>{row.contribution ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceSection({ evidence }) {
  const grouped = {};
  for (const row of evidence || []) {
    const key = row.requirement_ref?.requirement_key || "ungrouped";
    if (!grouped[key]) grouped[key] = { ref: row.requirement_ref, rows: [] };
    grouped[key].rows.push(row);
  }
  const keys = Object.keys(grouped);

  return (
    <>
      <h4>Requirement Evidence</h4>
      {!keys.length ? (
        <EmptyState message="No evidence rows attached to this evaluation." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Type</th>
                  <th>Strength</th>
                  <th>Candidate Evidence</th>
                </tr>
              </thead>
              <tbody>
                {keys.flatMap((reqKey) =>
                  grouped[reqKey].rows.map((row) => {
                    const evType = row.evidence_type || "unknown";
                    const chip =
                      evType === "matched"
                        ? "chip good"
                        : evType === "partial"
                        ? "chip"
                        : "chip bad";
                    const evidenceText =
                      row.candidate_evidence === null ||
                      row.candidate_evidence === undefined
                        ? "—"
                        : typeof row.candidate_evidence === "string"
                        ? row.candidate_evidence
                        : JSON.stringify(row.candidate_evidence);
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.requirement_ref?.requirement_key
                            || reqKey}
                        </td>
                        <td>
                          <span className={chip}>{normalizeStatus(evType)}</span>
                        </td>
                        <td className="muted-note">
                          {row.strength || "—"}
                        </td>
                        <td style={{ maxWidth: 340 }}>
                          {evidenceText}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ExplanationSection({ explanation }) {
  if (!explanation) {
    return <p className="muted-note">No explanation available.</p>;
  }
  const points = Array.isArray(explanation.points) ? explanation.points : [];
  return (
    <>
      <h4>AI Explanation</h4>
      {explanation.summary && (
        <p className="ai-explanation">{explanation.summary}</p>
      )}
      {points.length > 0 && (
        <ul className="strengths-list">
          {points.map((p, i) => (
            <li key={i}>{typeof p === "string" ? p : JSON.stringify(p)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ApplicationReview() {
  const { id: applicationId } = useParams();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState(null);

  const [decisionModal, setDecisionModal] = useState({ open: false, decision: null });
  const [decisionReason, setDecisionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState(null);

  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getReviewBundle(applicationId);
      setBundle(data);
    } catch (err) {
      setLoadError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner label="Loading review…" />;
  if (loadError) {
    return (
      <section>
        <button className="back" onClick={() => navigate("/applications")}>
          <ArrowLeft size={17} /> Back to Applications
        </button>
        <ErrorState message={loadError} onRetry={load} />
      </section>
    );
  }
  if (!bundle) {
    return (
      <section>
        <button className="back" onClick={() => navigate("/applications")}>
          <ArrowLeft size={17} /> Back to Applications
        </button>
        <div className="empty">Application not found.</div>
      </section>
    );
  }

  const { application, candidate, job, evaluation, evidence, poolRow } = bundle;

  const handleEvaluate = async () => {
    setEvaluating(true);
    setEvalError(null);
    setSuccessMsg("");
    try {
      const result = await runEvaluation(applicationId);
      setSuccessMsg(`Evaluation v${result.version_number} completed.`);
      await load();
    } catch (err) {
      setEvalError(extractError(err));
    } finally {
      setEvaluating(false);
    }
  };

  const openDecision = (decision) => {
    setDecisionModal({ open: true, decision });
    setDecisionReason("");
    setDecisionError(null);
  };

  const handleDecision = async () => {
    if (!decisionModal.decision) return;
    setSaving(true);
    setDecisionError(null);
    try {
      await recordDecision(applicationId, decisionModal.decision, decisionReason);
      setSuccessMsg(
        `${DECISION_LABELS[decisionModal.decision]} recorded successfully.`
      );
      setDecisionModal({ open: false, decision: null });
      await load();
    } catch (err) {
      setDecisionError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const scoreNumber = Number(evaluation?.score);
  const hasEvaluation = !!evaluation;
  const currentDecision = poolRow?.decision;
  const DecisionIcon = currentDecision ? DECISION_ICON[currentDecision] || Clock3 : Clock3;

  return (
    <section>
      <button className="back" onClick={() => navigate("/applications")}>
        <ArrowLeft size={17} /> Back to Applications
      </button>

      {/* ===== Header ===== */}
      <div className="detail-hero panel">
        <div className="detail-person">
          <div className="big-avatar">
            {(candidate?.name || "C")
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              {poolRow?.group && (
                <span className={`badge badge-${GROUP_TONE[poolRow.group] || "grey"}`}>
                  {GROUP_LABELS[poolRow.group] || poolRow.group}
                </span>
              )}
              <Badge status={application.status} />
            </div>
            <h2>{candidate?.name || "Candidate"}</h2>
            <p>{candidate?.email || "No email"} {candidate?.phone ? `· ${candidate?.phone}` : ""}</p>
            {job && <p style={{ marginTop: 2 }}>For: <strong>{job.title}</strong></p>}
          </div>
        </div>
        <div className="detail-hero-actions">
          {Number.isFinite(scoreNumber) ? (
            <div className="big-score">
              <strong>{scoreDisplay(evaluation.score)}%</strong>
              <span>Overall Score</span>
            </div>
          ) : (
            <div className="big-score">
              <strong style={{ color: "#98a2b3" }}>—</strong>
              <span>No Score</span>
            </div>
          )}
          <button
            type="button"
            className="primary"
            onClick={handleEvaluate}
            disabled={evaluating}
          >
            <Sparkles size={16} />
            {evaluating
              ? "Evaluating…"
              : hasEvaluation
              ? "Re-evaluate"
              : "Evaluate"}
          </button>
        </div>
      </div>

      {/* ===== Status messages ===== */}
      {successMsg && (
        <div className="success-message" style={{ marginBottom: 14 }}>
          {successMsg}
        </div>
      )}
      {evalError && (
        <div className="form-error" style={{ marginBottom: 14 }}>
          <AlertCircle size={14} style={{ marginRight: 6 }} />
          {evalError}
        </div>
      )}

      <div className="detail-grid">
        {/* ===== Left: Evaluation ===== */}
        <div className="panel">
          <div className="ai-title">
            <Sparkles size={18} />
            <h3>Evaluation</h3>
          </div>

          {!hasEvaluation ? (
            <EmptyState
              message={
                "No evaluation exists for this application. Evaluating requires an approved JobProfile and a current CandidateProfile."
              }
            />
          ) : (
            <>
              <EvaluationOverview evaluation={evaluation} />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
                <span className="chip">
                  Version {evaluation.version_number}
                </span>
                <span className="chip">{normalizeStatus(evaluation.status)}</span>
                {evaluation.scoring_version && (
                  <span className="chip">Scoring {evaluation.scoring_version}</span>
                )}
                {evaluation.provenance?.model && (
                  <span className="chip">{evaluation.provenance.model}</span>
                )}
              </div>

              <ScoreBreakdownTable breakdown={evaluation.score_breakdown} />

              <h4>Explanation</h4>
              <ExplanationSection explanation={evaluation.explanation} />

              {evaluation.recommendation && (
                <>
                  <h4>AI Recommendation (review signal only)</h4>
                  <p className="muted-note">
                    Final hiring decisions are made by HR — not by this system.
                  </p>
                  <p className="ai-explanation">{evaluation.recommendation}</p>
                </>
              )}

              <EvidenceSection evidence={evidence} />
            </>
          )}
        </div>

        {/* ===== Right: Decision ===== */}
        <div className="panel">
          <h3>HR Decision</h3>

          {currentDecision ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className={`badge badge-${DECISION_TONE[currentDecision] || "grey"}`}>
                  <DecisionIcon size={13} />
                  {normalizeStatus(currentDecision)}
                </span>
                {poolRow?.decision_created_at && (
                  <span className="muted-note">
                    {formatTimestamp(poolRow.decision_created_at)}
                  </span>
                )}
              </div>
              <p className="muted-note" style={{ marginBottom: 16 }}>
                A decision has already been recorded. Selecting a new decision
                will append a new entry.
              </p>
            </>
          ) : (
            <p className="muted-note" style={{ marginBottom: 16 }}>
              No decision recorded yet. Review the evaluation and evidence,
              then select an action below.
            </p>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {[HRDecisionValue.ADVANCE, HRDecisionValue.HOLD, HRDecisionValue.REJECT].map(
              (decision) => {
                const isAdvance = decision === HRDecisionValue.ADVANCE;
                const isReject = decision === HRDecisionValue.REJECT;
                const className = isAdvance
                  ? "btn btn-primary"
                  : isReject
                  ? "btn btn-danger"
                  : "btn btn-secondary";
                const Icon = DECISION_ICON[decision];
                return (
                  <button
                    key={decision}
                    type="button"
                    className={className}
                    onClick={() => openDecision(decision)}
                    disabled={saving}
                  >
                    <Icon size={16} />
                    {DECISION_LABELS[decision]}
                  </button>
                );
              }
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h4>Application</h4>
            <div className="info">
              <span>Status</span>
              <strong>
                <Badge status={application.status} />
              </strong>
            </div>
            <div className="info">
              <span>Applied</span>
              <strong>{formatTimestamp(application.created_at)}</strong>
            </div>
            {job && (
              <div className="info">
                <span>Job</span>
                <strong>{job.title}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Decision Modal ===== */}
      <Modal
        open={decisionModal.open}
        title={`${DECISION_LABELS[decisionModal.decision] || "Decision"} candidate?`}
        onClose={() => {
          if (!saving) setDecisionModal({ open: false, decision: null });
        }}
      >
        <p>
          {decisionModal.decision === HRDecisionValue.ADVANCE &&
            `Advance ${candidate?.name || "this candidate"} to the next stage?`}
          {decisionModal.decision === HRDecisionValue.HOLD &&
            `Place ${candidate?.name || "this candidate"} on hold?`}
          {decisionModal.decision === HRDecisionValue.REJECT &&
            `Reject ${candidate?.name || "this candidate"}?`}
        </p>
        <p className="muted-note" style={{ marginBottom: 10 }}>
          Reason (optional — required for clear audit trail):
        </p>
        <textarea
          value={decisionReason}
          onChange={(e) => setDecisionReason(e.target.value)}
          placeholder="Briefly explain why…"
          rows={3}
          disabled={saving}
        />
        {decisionError && (
          <div className="form-error" style={{ marginTop: 8 }}>
            {decisionError}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setDecisionModal({ open: false, decision: null })}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDecision}
            disabled={saving}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </Modal>
    </section>
  );
}