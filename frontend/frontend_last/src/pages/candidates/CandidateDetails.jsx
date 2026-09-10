import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Link2,
  Link as LinkIcon,
  Globe,
  ExternalLink,
  FileText,
  Pencil,
  MessageSquareText,
  Save,
} from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import Modal from "../../components/common/Modal";
import { getCandidateById, updateCandidate } from "../../services/candidateService";
import { findCandidateApplications } from "../../services/interviewQuestionSetService";

const Info = ({ l, v }) => (
  <div className="info">
    <span>{l}</span>
    <strong>{v || "—"}</strong>
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
  const [prepOpen, setPrepOpen] = useState(false);
  const [candidateApps, setCandidateApps] = useState([]);
  const [appsChecking, setAppsChecking] = useState(false);
  const [prepError, setPrepError] = useState("");

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

  const openPrep = async () => {
    setPrepError("");
    setPrepOpen(false);
    setAppsChecking(true);
    try {
      const apps = await findCandidateApplications(c.id);
      if (apps.length === 1) {
        navigate(`/interview-questions?applicationId=${apps[0].id}`);
        return;
      }
      if (apps.length === 0) {
        setPrepError("This candidate has no job applications yet. Create one from the Reviews page first.");
        return;
      }
      setCandidateApps(apps);
      setPrepOpen(true);
    } catch (err) {
      setPrepError(
        err?.response?.data?.detail || "Could not load this candidate's job applications."
      );
    } finally {
      setAppsChecking(false);
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
          <div className="big-score" style={{ textAlign: "right" }}>
            <strong className="muted-note">Score is per job application</strong>
            <span>View it in Application Review</span>
          </div>
          <button
            className="btn btn-secondary wide"
            onClick={openPrep}
            style={{ marginTop: 18 }}
          >
            <MessageSquareText size={16} /> {appsChecking ? "Checking applications..." : "Prepare Interview Questions"}
          </button>
          {prepError && <div className="form-error">{prepError}</div>}
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
          <p className="ai-explanation">
            AI screening runs against a specific job. Open the application review screen to run (or re-run) the
            evaluation and see the backend-computed score, the explanation, score breakdown, and requirement evidence.
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

      {/* ===== Choose Application for Question Prep ===== */}
      <Modal
        open={prepOpen}
        title="Choose a job application"
        onClose={() => setPrepOpen(false)}
      >
        <p className="muted-note">
          {c.name} has multiple job applications. Question preparation is scoped to one
          application — pick the job you want to prepare questions for.
        </p>
        <div className="application-picker">
          {candidateApps.map((app) => (
            <button
              key={app.id}
              className="application-picker-row"
              onClick={() => navigate(`/interview-questions?applicationId=${app.id}`)}
            >
              <strong>{app.jobTitle || "Untitled job"}</strong>
              <span className="pill">{app.status}</span>
            </button>
          ))}
        </div>
      </Modal>
    </section>
  );
}