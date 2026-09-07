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
  CalendarClock,
  Pencil,
  Save,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import Modal from "../../components/common/Modal";
import { getCandidateById, updateCandidate } from "../../services/candidateService";

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
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    let active = true;
    getCandidateById(id)
      .then((data) => {
        if (!active) return;
        setC(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setC(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const openEdit = () => {
    setEmail(c?.email || "");
    setPhone(c?.phone || "");
    setSaveError("");
    setSaveOk(false);
    setEditOpen(true);
  };

  const saveContact = async () => {
    setSaving(true);
    setSaveError("");
    setSaveOk(false);
    try {
      const updated = await updateCandidate(id, {
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setC({ ...c, email: updated?.email || "", phone: updated?.phone || "" });
      setSaveOk(true);
      setEditOpen(false);
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail || "Could not save the candidate's contact details."
      );
    } finally {
      setSaving(false);
    }
  };

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

  const skills = c.skills || [];
  const score = c.score;

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
              <Sparkles size={13} /> Candidate Profile
            </span>
            <h2>{c.name}</h2>
            <p>{c.summary || c.title || "Profile extracted from resume"}</p>
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
              {c.cv && (
                <a href={c.cv} target="_blank" rel="noreferrer">
                  <FileText size={16} /> Resume <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="detail-hero-actions">
          <div className="big-score">
            <strong>{score === null || score === undefined ? "—" : `${score}%`}</strong>
            <span>Match Score</span>
          </div>
          <Link className="primary" to="/interviews/schedule" state={{ candidate: c }}>
            <CalendarClock size={17} /> Schedule Interview
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">CONTACT</p>
              <h3>Candidate Details</h3>
            </div>
            <button className="btn-secondary" onClick={openEdit}>
              <Pencil size={15} /> Edit
            </button>
          </div>
          <Info l="Email" v={c.email} />
          <Info l="Phone" v={c.phone} />
          <Info l="Experience" v={c.experience} />

          <h4>Skills</h4>
          <div className="chips">
            {skills.length ? (
              skills.map((s) => (
                <span className="chip good" key={s}>
                  {s}
                </span>
              ))
            ) : (
              <span className="none">No extracted profile skills yet.</span>
            )}
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
            <strong>{score === null || score === undefined ? "—" : `${score}%`}</strong>
          </div>
          <div className="score-track">
            <i style={{ width: `${score ?? 0}%` }} />
          </div>

          <h4>AI Explanation</h4>
          <p className="ai-explanation">
            {c.reason ||
              "Screening runs against a specific job. Once a candidate is screened (per job), the score, matched/missing skills, and explanation appear here."}
          </p>
        </div>
      </div>

      {/* ===== Edit Contact Modal ===== */}
      <Modal open={editOpen} title="Edit contact details" onClose={() => setEditOpen(false)}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@company.com"
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
          />
        </label>
        {saveError && <div className="form-error">{saveError}</div>}
        {saveOk && <div className="form-success">Contact details saved.</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setEditOpen(false)}>
            Cancel
          </button>
          <button className="primary" onClick={saveContact} disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </Modal>
    </section>
  );
}