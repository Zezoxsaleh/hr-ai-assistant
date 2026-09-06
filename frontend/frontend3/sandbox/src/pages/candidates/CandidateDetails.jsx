import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Link2,
  Link as LinkIcon,
  Globe,
  ExternalLink,
  FileText,
  CheckCircle2,
  XCircle,
  CalendarClock,
  FolderGit2,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { getCandidateById } from "../../services/candidateService";

const Info = ({ l, v }) => (
  <div className="info">
    <span>{l}</span>
    <strong>{v || "Not provided"}</strong>
  </div>
);

export default function CandidateDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCandidateById(id).then((data) => {
      if (!active) return;
      setC(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <LoadingSpinner label="Loading candidate..." />;
  if (!c) {
    return (
      <section>
        <button className="back" onClick={() => navigate("/candidates")}>
          <ArrowLeft size={17} /> Back to Candidates
        </button>
        <div className="empty">Candidate not found.</div>
      </section>
    );
  }

  const score = c.score ?? 0;
  const matching = c.matching || [];
  const missing = c.missing || [];
  const strengths = c.strengths || [];
  const projects = c.projects || [];

  return (
    <section>
      <button className="back" onClick={() => navigate("/candidates")}>
        <ArrowLeft size={17} /> Back to Candidates
      </button>

      {/* ===== Candidate Profile ===== */}
      <div className="detail-hero panel">
        <div className="detail-person">
          <div className="big-avatar">
            {c.name
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div>
            <span className="pill">
              <Sparkles size={13} /> AI Screening
            </span>
            <h2>{c.name}</h2>
            <p>{c.title}</p>
          </div>
        </div>
        <div className="detail-hero-actions">
          <div className="big-score">
            <strong>{score}%</strong>
            <span>Overall Score</span>
          </div>
          <Link className="primary" to="/interviews/schedule" state={{ candidate: c }}>
            <CalendarClock size={17} /> Schedule Interview
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h3>Candidate Profile</h3>
          <Info l="Email" v={c.email} />
          <Info l="Phone" v={c.phone} />
          <Info l="Education" v={c.education} />
          <Info l="Experience" v={`${c.experience} years`} />

          <h4>Projects</h4>
          {projects.length ? (
            <div className="project-list">
              {projects.map((p) => (
                <div className="project-item" key={p.name}>
                  <FolderGit2 size={16} />
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-note">No projects listed.</p>
          )}

          <div className="links">
            {c.linkedin && (
              <a href={c.linkedin} target="_blank" rel="noreferrer">
                <LinkIcon size={16} /> LinkedIn <ExternalLink size={13} />
              </a>
            )}
            {c.github && (
              <a href={c.github} target="_blank" rel="noreferrer">
                <Link2 size={16} /> GitHub <ExternalLink size={13} />
              </a>
            )}
            {c.portfolio && (
              <a href={c.portfolio} target="_blank" rel="noreferrer">
                <Globe size={16} /> Portfolio <ExternalLink size={13} />
              </a>
            )}
            <a href={c.cv} target="_blank" rel="noreferrer">
              <FileText size={16} /> Resume <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* ===== AI Evaluation ===== */}
        <div className="panel">
          <div className="ai-title">
            <Sparkles size={18} />
            <h3>AI Evaluation</h3>
          </div>

          <div className="overall-score-row">
            <span>Overall Score</span>
            <strong>{score}%</strong>
          </div>
          <div className="score-track">
            <i style={{ width: `${score}%` }} />
          </div>

          <h4>Matched Skills</h4>
          <div className="chips">
            {matching.map((s) => (
              <span className="chip good" key={s}>
                <CheckCircle2 size={14} />
                {s}
              </span>
            ))}
            {!matching.length && <span className="none">No AI-screened skills recorded.</span>}
          </div>

          <h4>Missing Skills</h4>
          <div className="chips">
            {missing.length ? (
              missing.map((s) => (
                <span className="chip bad" key={s}>
                  <XCircle size={14} />
                  {s}
                </span>
              ))
            ) : (
              <span className="none">None 🎉</span>
            )}
          </div>

          {strengths.length > 0 && (
            <>
              <h4>Strengths</h4>
              <ul className="strengths-list">
                {strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}

          <h4>AI Explanation</h4>
          <p className="ai-explanation">
            {c.reason ||
              "No AI screening has run for this candidate yet. Screening results (score, matched/missing skills, strengths, explanation) appear here once an evaluation is produced by the backend."}
          </p>
        </div>
      </div>
    </section>
  );
}
