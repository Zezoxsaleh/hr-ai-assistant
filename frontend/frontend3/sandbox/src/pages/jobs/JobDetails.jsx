import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, MapPin, Briefcase, Clock3, CheckCircle2, Rocket, Ban } from "lucide-react";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { getJobById, deleteJob, updateJob } from "../../services/jobService";

export default function JobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getJobById(id).then((data) => {
      if (!active) return;
      setJob(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const onDelete = async () => {
    if (!window.confirm(`Delete "${job.title}"? This can't be undone.`)) return;
    try {
      await deleteJob(job.id);
      navigate("/jobs");
    } catch (err) {
      alert(err?.response?.data?.detail || err?.message || "Unable to delete this job.");
    }
  };

  const onChangeStatus = async () => {
    const next = job.status === "active" ? "closed" : "active";
    const updated = await updateJob(job.id, { status: next });
    if (updated) setJob(updated);
  };

  const isActive = job?.status === "active";

  if (loading) return <LoadingSpinner label="Loading job..." />;
  if (!job) {
    return (
      <section>
        <button className="back" onClick={() => navigate("/jobs")}>
          <ArrowLeft size={17} /> Back to Jobs
        </button>
        <div className="empty">Job not found.</div>
      </section>
    );
  }

  return (
    <section>
      <button className="back" onClick={() => navigate("/jobs")}>
        <ArrowLeft size={17} /> Back to Jobs
      </button>

      <div className="detail-hero panel">
        <div>
          <span className="pill">
            <Briefcase size={13} /> {job.department}
          </span>
          <h2>{job.title}</h2>
          <div className="job-meta">
            <span>
              <MapPin size={14} /> {job.location}
            </span>
            <span>
              <Clock3 size={14} /> {job.type}
            </span>
            <span>{job.experience} experience</span>
          </div>
        </div>
        <div className="detail-hero-actions">
          <Badge status={job.status} />
          {!isActive && (
            <button className="primary" onClick={onChangeStatus}>
              <Rocket size={16} /> Publish
            </button>
          )}
          {isActive && (
            <button className="btn-secondary" onClick={onChangeStatus}>
              <Ban size={16} /> Close
            </button>
          )}
          <button className="icon-btn" onClick={() => navigate(`/jobs/${job.id}/edit`)}>
            <Pencil size={16} />
          </button>
          <button className="icon-btn danger" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h3>Description</h3>
          <p className="job-description">{job.description}</p>

          <h4>Requirements</h4>
          <ul className="requirements-list">
            {job.requirements?.map((r, i) => (
              <li key={i}>
                <CheckCircle2 size={14} /> {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h3>Required Skills</h3>
          <div className="chips">
            {job.requiredSkills?.map((s) => (
              <span className="chip good" key={s}>
                {s}
              </span>
            ))}
          </div>

          <h4>Experience</h4>
          <p>{job.experience}</p>

          <h4>Applicants</h4>
          <p>{job.applicants} candidate(s) applied</p>
        </div>
      </div>
    </section>
  );
}
