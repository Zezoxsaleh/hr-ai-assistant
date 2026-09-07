import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock3,
  RefreshCw,
  FileText,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import ScoreBadge from "../../components/common/ScoreBadge";
import { HRDecisionValue } from "../../types/api";
import { getReviewWorkspace, runEvaluation, recordDecision } from "../../services/reviewService";

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
  [HRDecisionValue.HOLD]: "Hold",
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

const EVALUATION_STATUS_TONE = {
  completed: "green",
  running: "blue",
  queued: "blue",
  failed: "red",
  superseded: "grey",
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

function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Display formatting only — the score itself always comes from the backend.
function scoreNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function renderEvidenceValue(candidateEvidence) {
  if (candidateEvidence === null || candidateEvidence === undefined) {
    return { text: "—", note: "No candidate evidence was recorded for this row." };
  }
  if (typeof candidateEvidence === "string") {
    return { text: candidateEvidence, note: null };
  }
  if (Array.isArray(candidateEvidence)) {
    return { text: candidateEvidence.join(" · "), note: null };
  }
  if (typeof candidateEvidence === "object") {
    const parts = Object.entries(candidateEvidence).map(([k, v]) => {
      const value = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return value ? `${k}: ${value}` : k;
    });
    return { text: parts.filter(Boolean).join(" · "), note: null };
  }
  return { text: String(candidateEvidence), note: null };
}

// Per-requirement review signals are surfaced from BACKEND-provided values only
// (breakdown category + evidence_type, evidence strength). No score is
// computed here.
function buildSignals(evidence, breakdown) {
  const signals = [];
  for (const row of evidence || []) {
    const key = row?.requirement_ref?.requirement_key;
    const category = key ? breakdown?.[key]?.category : undefined;
    if (row?.evidence_type === "missing" && category === "must_have") {
      const label = breakdown?.[key]?.text || key || "requirement";
      signals.push({ kind: "missing_must_have", requirementKey: key, text: `Missing must-have: ${label}` });
    }
  }
  return signals;
}

function evidenceCounts(evidence) {
  const counts = { matched: 0, partial: 0, missing: 0 };
  for (const row of evidence || []) {
    if (row?.evidence_type && Object.prototype.hasOwnProperty.call(counts, row.evidence_type)) {
      counts[row.evidence_type] += 1;
    }
  }
  return counts;
}

function EvalStatusChip({ evaluation }) {
  const tone = EVALUATION_STATUS_TONE[evaluation?.status] || "grey";
  return <span className={`chip ${tone === "green" ? "good" : tone === "red" ? "bad" : ""}`}>{normalizeStatus(evaluation?.status)}</span>;
}

function EvidenceMatchChip({ evidenceType }) {
  const chip = evidenceType === "matched" ? "chip good" : evidenceType === "partial" ? "chip" : "chip bad";
  return <span className={chip}>{normalizeStatus(evidenceType)}</span>;
}

// ===== Score breakdown (CandidateEvaluation.score_breakdown) =====
function ScoreBreakdownTable({ breakdown }) {
  const rows = breakdown && typeof breakdown === "object" ? Object.values(breakdown) : [];
  if (!rows.length) {
    return <EmptyState message="No per-requirement score breakdown was returned by the evaluation." />;
  }
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Category</th>
              <th>Evidence type</th>
              <th>Evidence value</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.requirement_key || row.label}>
                <td>{row.text || row.label || row.requirement_key}</td>
                <td className="muted-note">{normalizeStatus(row.category)}</td>
                <td>
                  <EvidenceMatchChip evidenceType={row.evidence_type} />
                </td>
                <td className="muted-note">{row.evidence_value ?? "—"}</td>
                <td>{row.contribution ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Requirement-level match evidence =====
function EvidenceSection({ evidence, breakdown }) {
  const counts = evidenceCounts(evidence);
  const signals = buildSignals(evidence, breakdown);
  const breakdownTextByKey = (breakdown && typeof breakdown === "object")
    ? Object.values(breakdown).reduce((map, row) => {
        if (row?.requirement_key) map[row.requirement_key] = row.text || row.label || row.requirement_key;
        return map;
      }, {})
    : {};
  const rows = (evidence || []).map((row) => {
    const rendered = renderEvidenceValue(row.candidate_evidence);
    return { row, rendered };
  });

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {counts.matched > 0 && <span className="chip good">{counts.matched} matched</span>}
        {counts.partial > 0 && <span className="chip">{counts.partial} partial</span>}
        {counts.missing > 0 && <span className="chip bad">{counts.missing} missing</span>}
        {signals.length > 0 && (
          <span className="chip bad">{signals.length} review signal{signals.length > 1 ? "s" : ""}</span>
        )}
      </div>

      {!rows.length ? (
        <EmptyState message="No requirement evidence was attached to this evaluation." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Match</th>
                  <th>Candidate evidence</th>
                  <th>Strength</th>
                  <th>Review signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, rendered }) => {
                  const key = row?.requirement_ref?.requirement_key;
                  const textRef = row?.requirement_ref?.text || row?.requirement_ref?.skill || "";
                  const reqLabel = [textRef || breakdownTextByKey[key], key].filter(Boolean).join(" · ");
                  return (
                    <tr key={row.id}>
                      <td className="muted-note">{reqLabel || "—"}</td>
                      <td>
                        <EvidenceMatchChip evidenceType={row.evidence_type} />
                      </td>
                      <td style={{ maxWidth: 340 }}>
                        <div>{rendered.text}</div>
                        {rendered.note && <div className="muted-note">{rendered.note}</div>}
                      </td>
                      <td className="muted-note">{row.strength || "—"}</td>
                      <td className="muted-note">
                        {signals
                          .filter((s) => s.requirementKey === key)
                          .map((s) => (
                            <div key={s.kind}>{s.text}</div>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ===== Explanation (evaluation.explanation) =====
function ExplanationSection({ explanation }) {
  if (!explanation) {
    return <EmptyState message="The evaluation did not include an explanation for this score." />;
  }
  const points = Array.isArray(explanation.points) ? explanation.points : [];
  return (
    <>
      {typeof explanation.summary === "string" && explanation.summary && (
        <p className="ai-explanation" style={{ marginBottom: points.length ? 10 : 0 }}>
          {explanation.summary}
        </p>
      )}
      {points.length > 0 && (
        <ul className="strengths-list">
          {points.map((point, i) => (
            <li key={i}>{typeof point === "string" ? point : JSON.stringify(point)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

// ===== Review signals strip (derived from backend breakdown/evidence only) =====
function SignalsSummary({ signals }) {
  if (!signals.length) {
    return <p className="muted-note">No notable review signals. No must-have requirement is currently missing.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {signals.map((signal) => (
        <div className="signal-row" key={`${signal.kind}-${signal.text}`}>
          <AlertCircle size={14} /> {signal.text}
        </div>
      ))}
    </div>
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
      const data = await getReviewWorkspace(applicationId);
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

  if (loading) return <LoadingSpinner label="Loading review workspace…" />;
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

  const { application, candidate, job, evaluation, evidence, poolRow, resume, profile } = bundle;

  const hasEvaluation = !!evaluation;
  const score = scoreNumber(evaluation?.score);
  const group = poolRow?.group;
  const currentDecision = poolRow?.decision;
  const DecisionIcon = currentDecision ? DECISION_ICON[currentDecision] || Clock3 : Clock3;
  const signals = buildSignals(evidence, evaluation?.score_breakdown);
  const profileData = profile?.profile_data || {};
  const skills = Array.isArray(profileData.skills) ? profileData.skills : [];
  const experience = Array.isArray(profileData.experience) ? profileData.experience : [];

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
      setSuccessMsg(`${DECISION_LABELS[decisionModal.decision]} recorded for ${candidate?.name || "this candidate"}.`);
      setDecisionModal({ open: false, decision: null });
      await load();
    } catch (err) {
      setDecisionError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <button className="back" onClick={() => navigate("/applications")}>
        <ArrowLeft size={17} /> Back to Applications
      </button>

      {/* ===== 1. Candidate ===== */}
      <div className="panel review-hero">
        <div className="detail-person">
          <div className="big-avatar">
            {(candidate?.name || "C")
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              {group && (
                <span className={`badge badge-${GROUP_TONE[group] || "grey"}`}>{GROUP_LABELS[group] || group}</span>
              )}
              <Badge status={application.status} />
              {hasEvaluation && <EvalStatusChip evaluation={evaluation} />}
            </div>
            <h2>{candidate?.name || "Candidate"}</h2>
            <p>
              {candidate?.email ? candidate.email : "No email on file"}
              {candidate?.phone ? ` · ${candidate.phone}` : ""}
            </p>
            <p className="muted-note" style={{ marginTop: 4 }}>
              {job ? `Applying for ${job.title}` : "No linked job"}
            </p>
          </div>
        </div>
        <div className="detail-hero-actions">
          {hasEvaluation && score !== null ? (
            <div className="big-score">
              <strong>{score}%</strong>
              <span>AI Score</span>
            </div>
          ) : (
            <div className="big-score" style={{ textAlign: "right" }}>
              <strong style={{ color: "#98a2b3" }}>Not evaluated</strong>
              <span>Run the AI evaluation below</span>
            </div>
          )}
          <button type="button" className="primary" onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? (
              <>
                <RefreshCw size={16} className="spin" /> Evaluating…
              </>
            ) : (
              <>
                <Sparkles size={16} /> {hasEvaluation ? "Re-evaluate" : "Evaluate Candidate"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ===== Status messages ===== */}
      {successMsg && (
        <div className="success-message" style={{ marginBottom: 14 }}>
          <CheckCircle2 size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          {successMsg}
        </div>
      )}
      {evalError && (
        <div className="form-error" style={{ marginBottom: 14 }}>
          <AlertCircle size={14} style={{ marginRight: 6 }} />
          {evalError}
        </div>
      )}

      {/* ===== Candidate profile ===== */}
      <div className="panel review-block">
        <div className="review-block-title">
          <h3>Candidate Profile</h3>
          <span className="flag flag-ai">AI Assisted</span>
        </div>

        <div className="review-stack">
          <div className="info">
            <span>Contact · Email</span>
            <strong>{candidate?.email || "No email on file"}</strong>
          </div>
          <div className="info">
            <span>Contact · Phone</span>
            <strong>{candidate?.phone || "No phone on file"}</strong>
          </div>
          {typeof profileData.summary === "string" && profileData.summary && (
            <div className="info">
              <span>Summary</span>
              <strong style={{ fontWeight: 500 }}>{profileData.summary}</strong>
            </div>
          )}
        </div>

        <h4>Experience</h4>
        {experience.length ? (
          <ul className="strengths-list" style={{ marginBottom: 4 }}>
            {experience.map((item, i) => (
              <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
            ))}
          </ul>
        ) : (
          <EmptyState message="No experience entries in the extracted candidate profile." />
        )}

        <h4>Skills</h4>
        {skills.length ? (
          <div className="chips" style={{ marginBottom: 4 }}>
            {skills.map((s) => (
              <span className="chip good" key={s}>
                {s}
              </span>
            ))}
          </div>
        ) : (
          <EmptyState message="No skills in the extracted candidate profile." />
        )}

        <h4>Resume</h4>
        <div className="resume-meta">
          <FileText size={16} />
          <div>
            <strong>{resume?.original_filename || "Resume on file"}</strong>
            {(resume?.content_type || formatBytes(resume?.file_size_bytes)) && (
              <div className="muted-note">
                {[resume?.content_type, formatBytes(resume?.file_size_bytes)].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>
        <p className="muted-note" style={{ marginTop: 8 }}>
          Resume attachment preview is not available through the API.
        </p>
      </div>

      {/* ===== 2. Application / Job context ===== */}
      <div className="panel review-block">
        <div className="review-block-title">
          <h3>Application / Job</h3>
          <span className="flag flag-human">Human Review</span>
        </div>
        <div className="detail-grid review-2col">
          <div>
            <div className="info">
              <span>Candidate</span>
              <strong>{candidate?.name || "—"}</strong>
            </div>
            <div className="info">
              <span>Job title</span>
              <strong>{job?.title || "—"}</strong>
            </div>
            {job?.department && (
              <div className="info">
                <span>Department</span>
                <strong>{job.department}</strong>
              </div>
            )}
          </div>
          <div>
            <div className="info">
              <span>Application ID</span>
              <strong className="mono">{application.id}</strong>
            </div>
            <div className="info">
              <span>Application status</span>
              <strong>
                <Badge status={application.status} />
              </strong>
            </div>
            <div className="info">
              <span>Applied</span>
              <strong>{formatTimestamp(application.created_at)}</strong>
            </div>
          </div>
        </div>

        <h4>Current HR decision</h4>
        {currentDecision ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className={`badge badge-${DECISION_TONE[currentDecision] || "grey"}`}>
              <DecisionIcon size={13} /> {normalizeStatus(currentDecision)}
            </span>
            {poolRow?.decision_created_at && (
              <span className="muted-note">{formatTimestamp(poolRow.decision_created_at)}</span>
            )}
          </div>
        ) : (
          <p className="muted-note">No HR decision recorded yet.</p>
        )}
      </div>

      {/* ===== Status strip ===== */}
      <div className="status-strip">
        <span className="status-item">
          <span>Evaluation</span>
          <strong>{hasEvaluation ? `v${evaluation.version_number} · ${normalizeStatus(evaluation.status)}` : "Not run yet"}</strong>
        </span>
        <span className="status-item">
          <span>Score</span>
          <strong>{hasEvaluation && score !== null ? `${score}%` : "—"}</strong>
        </span>
        <span className="status-item">
          <span>Group</span>
          <strong>{group ? GROUP_LABELS[group] || group : "—"}</strong>
        </span>
        <span className="status-item">
          <span>HR decision</span>
          <strong>{currentDecision ? normalizeStatus(currentDecision) : "None"}</strong>
        </span>
        <span className="status-item">
          <span>Review signals</span>
          <strong>{hasEvaluation ? signals.length : "—"}</strong>
        </span>
      </div>

      {/* ===== 3. AI Evaluation ===== */}
      <div className="panel review-block ai-box">
        <div className="review-block-title">
          <h3>AI Evaluation</h3>
          <span className="flag flag-ai">AI Generated</span>
        </div>

        {!hasEvaluation ? (
          <EmptyState
            icon={Sparkles}
            message={
              "Evaluation not run yet. Running the evaluation uses the approved job profile and the current candidate profile to produce a score, an explanation, and per-requirement evidence."
            }
            action={
              <button type="button" className="primary" onClick={handleEvaluate} disabled={evaluating}>
                <Sparkles size={16} /> Evaluate Candidate
              </button>
            }
          />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <EvalStatusChip evaluation={evaluation} />
              <span className="chip">Version {evaluation.version_number}</span>
              {evaluation.scoring_version && <span className="chip">Scoring {evaluation.scoring_version}</span>}
              {evaluation.provenance?.model && <span className="chip">{evaluation.provenance.model}</span>}
              <span className="chip">Run {formatTimestamp(evaluation.created_at)}</span>
            </div>

            {evaluation.status !== "completed" && (
              <div className="form-error" style={{ marginBottom: 12 }}>
                <AlertCircle size={14} style={{ marginRight: 6 }} />
                This evaluation did not complete (status: {normalizeStatus(evaluation.status)}).
              </div>
            )}

            {/* 4. Score */}
            <div className="score-hero">
              {score !== null ? (
                <>
                  <ScoreBadge value={score} size={56} />
                  <div>
                    <strong>{score}%</strong>
                    <span>Overall score — computed by the backend from requirement evidence.</span>
                  </div>
                </>
              ) : (
                <div>
                  <strong style={{ color: "#98a2b3" }}>No score</strong>
                  <span>The backend recorded this evaluation without a score.</span>
                </div>
              )}
            </div>
            {score !== null && (
              <div className="score-track" style={{ marginBottom: 4 }}>
                <i style={{ width: `${score}%` }} />
              </div>
            )}

            {/* 5. Why this score? */}
            <h4>Why this score?</h4>
            <ExplanationSection explanation={evaluation.explanation} />

            {/* Score breakdown */}
            <h4>Score breakdown</h4>
            <ScoreBreakdownTable breakdown={evaluation.score_breakdown} />

            {/* 6. Requirement evidence */}
            <h4>Requirement evidence</h4>
            <EvidenceSection evidence={evidence} breakdown={evaluation.score_breakdown} />

            {/* 7. Review signals */}
            <h4>Review signals</h4>
            <SignalsSummary signals={signals} />
          </>
        )}
      </div>

      {/* ===== 8. HR decision ===== */}
      <div className="panel review-block review-decision">
        <div className="review-block-title">
          <h3>Your Decision</h3>
          <span className="flag flag-human">Human Decision</span>
        </div>

        <p className="muted-note" style={{ marginBottom: 14 }}>
          The AI evaluation above is for review only. Final hiring decisions are made by the HR team — never by the system.
        </p>

        {currentDecision ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span className={`badge badge-${DECISION_TONE[currentDecision] || "grey"}`}>
                <DecisionIcon size={13} /> {normalizeStatus(currentDecision)}
              </span>
              {poolRow?.decision_created_at && (
                <span className="muted-note">{formatTimestamp(poolRow.decision_created_at)}</span>
              )}
            </div>
            <p className="muted-note">
              A decision is already recorded. Choosing a new action appends an additional decision entry for the audit trail.
            </p>
          </div>
        ) : (
          <p className="muted-note" style={{ marginBottom: 12 }}>
            No decision recorded yet. Review the evaluation and evidence, then choose an action.
          </p>
        )}

        <div className="decision-actions">
          {[HRDecisionValue.ADVANCE, HRDecisionValue.HOLD, HRDecisionValue.REJECT].map((decision) => {
            const isAdvance = decision === HRDecisionValue.ADVANCE;
            const isReject = decision === HRDecisionValue.REJECT;
            const className = isAdvance ? "btn btn-primary" : isReject ? "btn btn-danger" : "btn btn-secondary";
            const Icon = DECISION_ICON[decision];
            return (
              <button key={decision} type="button" className={className} onClick={() => openDecision(decision)} disabled={saving}>
                <Icon size={16} /> {DECISION_LABELS[decision]}
              </button>
            );
          })}
        </div>

        <div className="flow-note">
          <p className="muted-note">
            Recommended flow: <strong>Evaluation → HR Decision → Advance → Interview questions → HR approval → Schedule interview.</strong>
            Scheduling is only available after an Advance decision.
          </p>
        </div>
      </div>

      {/* ===== Decision Modal ===== */}
      <Modal
        open={decisionModal.open}
        title={`${DECISION_LABELS[decisionModal.decision] || "Decision"} ${candidate?.name ? `— ${candidate.name}` : "candidate"}?`}
        onClose={() => {
          if (!saving) setDecisionModal({ open: false, decision: null });
        }}
      >
        <p>
          {decisionModal.decision === HRDecisionValue.ADVANCE &&
            "Advanceing moves this candidate toward the interview stage. Confirm the decision below."}
          {decisionModal.decision === HRDecisionValue.HOLD &&
            "Holding pauses this application while keeping the candidate in the pipeline."}
          {decisionModal.decision === HRDecisionValue.REJECT &&
            "Rejecting records the candidate as no longer under consideration for this role."}
        </p>
        <p className="muted-note" style={{ marginBottom: 10 }}>
          Reason (optional — helps keep a clear audit trail):
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
          <button className="btn btn-secondary" onClick={() => setDecisionModal({ open: false, decision: null })} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleDecision} disabled={saving}>
            {saving ? "Saving…" : "Confirm Decision"}
          </button>
        </div>
      </Modal>
    </section>
  );
}