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
  User,
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  Link2,
  Globe,
  Download,
  Languages,
  MessageSquareText,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import PipelineActions from "../../components/common/PipelineActions";
import ScoreBadge from "../../components/common/ScoreBadge";
import { HRDecisionValue } from "../../types/api";
import { getReviewWorkspace, runEvaluation, recordDecision } from "../../services/reviewService";
import { downloadResume } from "../../services/resumeService";

const GROUP_LABELS = {
  must_review: "Must Review",
  consider: "Consider",
  lower_priority: "Lower Priority",
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

function scoreNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function renderEvidenceValue(candidateEvidence) {
  if (candidateEvidence === null || candidateEvidence === undefined) {
    return { text: "—", note: "No candidate evidence recorded for this requirement." };
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
    return { text: parts.filter(Boolean).join(" · ") || "—", note: null };
  }
  return { text: String(candidateEvidence), note: null };
}

function buildSignals(evidence, breakdown) {
  const signals = [];
  for (const row of evidence || []) {
    const key = row?.requirement_ref?.requirement_key;
    const category = key ? breakdown?.[key]?.category : undefined;
    if (row?.evidence_type === "missing" && category === "must_have") {
      const label = breakdown?.[key]?.text || key || "requirement";
      signals.push({ kind: "missing_must_have", requirementKey: key, text: `Missing must-have requirement: ${label}` });
    } else if (row?.evidence_type === "missing") {
      const label = breakdown?.[key]?.text || key || "requirement";
      signals.push({ kind: "missing_requirement", requirementKey: key, text: `Missing requirement: ${label}` });
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
  return (
    <span className={`chip ${tone === "green" ? "good" : tone === "red" ? "bad" : ""}`}>
      {normalizeStatus(evaluation?.status)}
    </span>
  );
}

function EvidenceMatchChip({ evidenceType }) {
  const chip = evidenceType === "matched" ? "chip good" : evidenceType === "partial" ? "chip" : "chip bad";
  return <span className={chip}>{normalizeStatus(evidenceType)}</span>;
}

// ===== Score Breakdown Table =====
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
              <th>Evidence Type</th>
              <th>Evidence Value</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.requirement_key || row.label || idx}>
                <td>{row.text || row.label || row.requirement_key || "—"}</td>
                <td className="muted-note">{normalizeStatus(row.category) || "—"}</td>
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

// ===== Requirement-level Match Evidence =====
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
                  <th>Candidate Evidence</th>
                  <th>Strength</th>
                  <th>Review Signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, rendered }, idx) => {
                  const key = row?.requirement_ref?.requirement_key;
                  const textRef = row?.requirement_ref?.text || row?.requirement_ref?.skill || "";
                  const reqLabel = [textRef || breakdownTextByKey[key], key].filter(Boolean).join(" · ");
                  const matchingSignals = signals.filter((s) => s.requirementKey === key);
                  return (
                    <tr key={row.id || idx}>
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
                        {matchingSignals.length > 0 ? (
                          matchingSignals.map((s) => <div key={s.kind}>{s.text}</div>)
                        ) : (
                          "—"
                        )}
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

// ===== Explanation Section =====
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

// ===== Review Signals Summary =====
function SignalsSummary({ signals }) {
  if (!signals.length) {
    return <p className="muted-note">No notable review signals. No must-have requirement is currently missing.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {signals.map((signal) => (
        <div className="signal-row" key={`${signal.kind}-${signal.requirementKey || signal.text}`}>
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
  const [downloading, setDownloading] = useState(false);
  const [cvError, setCvError] = useState("");

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
  const skills = Array.isArray(profileData.skills) ? profileData.skills : Array.isArray(candidate?.skills) ? candidate.skills : [];
  const experience = Array.isArray(profileData.experience) ? profileData.experience : [];
  const education = Array.isArray(profileData.education) ? profileData.education : [];
  const languages = Array.isArray(profileData.languages) ? profileData.languages : [];
  const certifications = Array.isArray(profileData.certifications) ? profileData.certifications : [];
  const location = profileData.location || profileData.city || candidate?.location || null;
  const summary = profileData.summary || candidate?.summary || null;
  const contact = {
    email: profileData.email || candidate?.email || null,
    phone: profileData.phone || candidate?.phone || null,
  };
  const withScheme = (value) =>
    value && !/^https?:\/\//i.test(value) ? `https://${value}` : value;

  const profileLinks = [
    { label: "LinkedIn", url: profileData.linkedin_url, icon: Link2 },
    { label: "GitHub", url: profileData.github_url, icon: Link2 },
    { label: "Portfolio", url: profileData.portfolio_url, icon: Globe },
  ]
    .filter((link) => link.url)
    .map((link) => ({ ...link, url: withScheme(link.url) }));

  const handleDownloadCv = async () => {
    if (!resume?.id) return;
    setDownloading(true);
    setCvError("");
    try {
      const { blob, filename } = await downloadResume(resume.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setCvError(extractError(err));
    } finally {
      setDownloading(false);
    }
  };

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

      {/* ===== Global Notification Banners ===== */}
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

      {/* ===== Status Strip Summary ===== */}
      <div className="status-strip" style={{ marginBottom: 16 }}>
        <span className="status-item">
          <span>Evaluation Status</span>
          <strong>{hasEvaluation ? `v${evaluation.version_number} · ${normalizeStatus(evaluation.status)}` : "Not run yet"}</strong>
        </span>
        <span className="status-item">
          <span>AI Score</span>
          <strong>{hasEvaluation && score !== null ? `${score}%` : "—"}</strong>
        </span>
        <span className="status-item">
          <span>Candidate Group</span>
          <strong>{group ? GROUP_LABELS[group] || group : "—"}</strong>
        </span>
        <span className="status-item">
          <span>HR Decision</span>
          <strong>{currentDecision ? normalizeStatus(currentDecision) : "None"}</strong>
        </span>
        <span className="status-item">
          <span>Review Signals</span>
          <strong>{hasEvaluation ? signals.length : "—"}</strong>
        </span>
      </div>

      {/* =======================================================
          1. CANDIDATE PROFILE (AI Assisted)
          ======================================================= */}
      <div className="panel review-block">
        <div className="review-block-title">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <User size={18} />
            <h3>Candidate Profile</h3>
          </div>
          <span className="flag flag-ai">
            <Sparkles size={12} /> AI Assisted Profile
          </span>
        </div>

        <div className="detail-person" style={{ marginBottom: 16 }}>
          <div className="big-avatar">
            {(candidate?.name || "C")
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div>
            <h2>{candidate?.name || "Candidate"}</h2>
            {summary && <p className="muted-note" style={{ marginTop: 4 }}>{summary}</p>}
          </div>
        </div>

        <div className="review-stack" style={{ marginBottom: 16 }}>
          <div className="info">
            <span><Mail size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Contact · Email</span>
            <strong>{contact.email || "—"}</strong>
          </div>
          <div className="info">
            <span><Phone size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Contact · Phone</span>
            <strong>{contact.phone || "—"}</strong>
          </div>
          {location && (
            <div className="info">
              <span><MapPin size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Location</span>
              <strong>{location}</strong>
            </div>
          )}
        </div>

        {profileLinks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4>Links</h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profileLinks.map((link) => {
                const LinkIcon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-small"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <LinkIcon size={14} /> {link.label}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <h4><Briefcase size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} /> Experience</h4>
          {experience.length ? (
            <ul className="strengths-list" style={{ marginBottom: 12 }}>
              {experience.map((item, i) => (
                <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No experience entries in the extracted candidate profile." />
          )}
        </div>

        {education.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4><GraduationCap size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} /> Education</h4>
            <ul className="strengths-list" style={{ marginBottom: 12 }}>
              {education.map((item, i) => (
                <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          </div>
        )}

        {languages.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4><Languages size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} /> Languages</h4>
            <div className="chips" style={{ marginBottom: 12 }}>
              {languages.map((lang) => (
                <span className="chip" key={lang}>
                  {lang}
                </span>
              ))}
            </div>
          </div>
        )}

        {certifications.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4><ShieldCheck size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} /> Certifications</h4>
            <ul className="strengths-list" style={{ marginBottom: 12 }}>
              {certifications.map((cert, i) => (
                <li key={i}>{typeof cert === "string" ? cert : JSON.stringify(cert)}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <h4>Skills</h4>
          {skills.length ? (
            <div className="chips" style={{ marginBottom: 12 }}>
              {skills.map((s) => (
                <span className="chip good" key={s}>
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState message="No skills found in candidate profile." />
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <h4>Resume Document</h4>
          <div className="resume-meta" style={{ padding: 12, borderRadius: 8, background: "var(--bg-muted, #f8fafc)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <FileText size={24} style={{ color: "var(--primary-color, #2563eb)" }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>{resume?.original_filename || "Resume on file"}</strong>
              {(resume?.content_type || formatBytes(resume?.file_size_bytes)) && (
                <div className="muted-note" style={{ fontSize: 13, marginTop: 2 }}>
                  {[resume?.content_type, formatBytes(resume?.file_size_bytes)].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            {resume?.id && (
              <button type="button" className="btn btn-secondary btn-small" onClick={handleDownloadCv} disabled={downloading}>
                <Download size={14} /> {downloading ? "Downloading…" : "Download CV"}
              </button>
            )}
          </div>
          {cvError && (
            <div className="form-error" style={{ marginTop: 8 }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              {cvError}
            </div>
          )}
        </div>
      </div>

      {/* =======================================================
          2. APPLICATION / JOB CONTEXT (Human Review)
          ======================================================= */}
      <div className="panel review-block">
        <div className="review-block-title">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Briefcase size={18} />
            <h3>Application / Job Context</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="flag flag-human">
              <User size={12} /> Human Review
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => navigate(`/applications/${applicationId}/questions`)}
            >
              <MessageSquareText size={14} /> Interview Questions
            </button>
          </div>
        </div>
        <div className="detail-grid review-2col">
          <div>
            <div className="info">
              <span>Candidate</span>
              <strong>{candidate?.name || "—"}</strong>
            </div>
            <div className="info">
              <span>Job Title</span>
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
              <span>Application Status</span>
              <div>
                <Badge status={application.status} />
              </div>
            </div>
            <div className="info">
              <span>Applied On</span>
              <strong>{formatTimestamp(application.created_at)}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <h4>Current HR Decision</h4>
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
      </div>

      {/* =======================================================
          3. AI EVALUATION (AI Generated)
          ======================================================= */}
      <div className="panel review-block ai-box">
        <div className="review-block-title">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} />
            <h3>AI Evaluation</h3>
          </div>
          <span className="flag flag-ai">
            <Sparkles size={12} /> AI Generated
          </span>
        </div>

        {!hasEvaluation ? (
          <EmptyState
            icon={Sparkles}
            message="Evaluation not run yet. Running the AI evaluation analyzes the candidate profile against job requirements to produce a score, explanation, breakdown, and evidence."
            action={
              <button type="button" className="primary" onClick={handleEvaluate} disabled={evaluating}>
                {evaluating ? (
                  <>
                    <RefreshCw size={16} className="spin" /> Evaluating…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Evaluate Candidate
                  </>
                )}
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
              <button
                type="button"
                className="btn-secondary"
                style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }}
                onClick={handleEvaluate}
                disabled={evaluating}
              >
                {evaluating ? <RefreshCw size={12} className="spin" /> : <RefreshCw size={12} />} Re-evaluate
              </button>
            </div>

            {evaluation.status !== "completed" && (
              <div className="form-error" style={{ marginBottom: 12 }}>
                <AlertCircle size={14} style={{ marginRight: 6 }} />
                This evaluation did not complete normally (status: {normalizeStatus(evaluation.status)}).
              </div>
            )}

            {/* 4. Score */}
            <div className="score-hero">
              {score !== null ? (
                <>
                  <ScoreBadge value={score} size={56} />
                  <div>
                    <strong>{score}% Match Score</strong>
                    <span style={{ display: "block", fontSize: 13, color: "var(--text-muted, #64748b)" }}>
                      Backend authoritative overall score calculated from requirement evidence.
                    </span>
                  </div>
                </>
              ) : (
                <div>
                  <strong style={{ color: "#98a2b3" }}>No Score Recorded</strong>
                  <span style={{ display: "block", fontSize: 13, color: "var(--text-muted, #64748b)" }}>
                    The backend recorded this evaluation without a numerical score.
                  </span>
                </div>
              )}
            </div>
            {score !== null && (
              <div className="score-track" style={{ marginBottom: 16 }}>
                <i style={{ width: `${score}%` }} />
              </div>
            )}

            {/* 5. Why this score? */}
            <h4>Why this score?</h4>
            <ExplanationSection explanation={evaluation.explanation} />

            {/* 6. Requirement evidence & Score Breakdown */}
            <h4>Score Breakdown</h4>
            <ScoreBreakdownTable breakdown={evaluation.score_breakdown} />

            <h4>Requirement Match Evidence</h4>
            <EvidenceSection evidence={evidence} breakdown={evaluation.score_breakdown} />

            {/* 7. Review Signals */}
            <h4>Review Signals</h4>
            <SignalsSummary signals={signals} />
          </>
        )}
      </div>

      {/* =======================================================
          8. HR DECISION (Human Decision)
          ======================================================= */}
      <div className="panel review-block review-decision">
        <div className="review-block-title">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={18} />
            <h3>Your Decision</h3>
          </div>
          <span className="flag flag-human">
            <User size={12} /> Human Decision
          </span>
        </div>

        <p className="muted-note" style={{ marginBottom: 14 }}>
          The AI evaluation above provides candidate screening insights. Final hiring decisions are strictly made by HR professionals — never automatically by the AI system.
        </p>

        {currentDecision ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span className={`badge badge-${DECISION_TONE[currentDecision] || "grey"}`}>
                <DecisionIcon size={13} /> {normalizeStatus(currentDecision)}
              </span>
              {poolRow?.decision_created_at && (
                <span className="muted-note">{formatTimestamp(poolRow.decision_created_at)}</span>
              )}
            </div>
            <p className="muted-note" style={{ fontSize: 12 }}>
              An HR decision is currently recorded. Submitting a new decision will append an entry to the audit log.
            </p>
          </div>
        ) : (
          <p className="muted-note" style={{ marginBottom: 14 }}>
            No HR decision recorded yet. Review the evaluation and requirement evidence above, then select an action below.
          </p>
        )}

        <div className="decision-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <PipelineActions currentStatus={undefined} onDecision={openDecision} disabled={saving} />
        </div>

        <div className="flow-note" style={{ padding: 10, borderRadius: 6, background: "var(--bg-muted, #f8fafc)", fontSize: 12 }}>
          <p className="muted-note" style={{ margin: 0 }}>
            <strong>Recruitment Flow:</strong> Evaluation → HR Decision. Advancing or holding a candidate keeps them in the
            organization talent pool for current and future roles; rejecting records them as not moving forward.
          </p>
        </div>
      </div>

      {/* ===== Decision Confirmation Modal ===== */}
      <Modal
        open={decisionModal.open}
        title={`Confirm HR Decision: ${DECISION_LABELS[decisionModal.decision] || "Decision"}`}
        onClose={() => {
          if (!saving) setDecisionModal({ open: false, decision: null });
        }}
      >
        <p style={{ marginBottom: 12 }}>
          {decisionModal.decision === HRDecisionValue.ADVANCE &&
            `Advancing ${candidate?.name || "this candidate"} moves them forward in the recruitment pipeline.`}
          {decisionModal.decision === HRDecisionValue.HOLD &&
            `Putting ${candidate?.name || "this candidate"} on hold keeps their application active while pausing immediate action.`}
          {decisionModal.decision === HRDecisionValue.REJECT &&
            `Rejecting ${candidate?.name || "this candidate"} records them as not moving forward for this position.`}
        </p>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Reason for decision (optional audit note):
          </span>
          <textarea
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="Enter reason for audit record…"
            rows={3}
            disabled={saving}
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border-color, #cbd5e1)" }}
          />
        </label>

        {decisionError && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            <AlertCircle size={14} style={{ marginRight: 6 }} />
            {decisionError}
          </div>
        )}

        <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setDecisionModal({ open: false, decision: null })} disabled={saving}>
            Cancel
          </button>
          <button
            className={decisionModal.decision === HRDecisionValue.REJECT ? "btn btn-danger" : "btn btn-primary"}
            onClick={handleDecision}
            disabled={saving}
          >
            {saving ? "Saving…" : `Confirm ${DECISION_LABELS[decisionModal.decision]}`}
          </button>
        </div>
      </Modal>
    </section>
  );
}