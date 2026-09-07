import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MapPin,
  Briefcase,
  Clock3,
  CheckCircle2,
  Rocket,
  Ban,
  Sparkles,
  FileCheck2,
} from "lucide-react";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { getJobById, deleteJob, updateJob } from "../../services/jobService";
import {
  listJobProfiles,
  extractJobProfile,
  approveJobProfile,
} from "../../services/jobProfileService";

const REQUIREMENT_TONE = {
  must_have: "chip good",
  important: "chip",
  nice_to_have: "chip bad",
};

const SOURCE_LABEL = {
  ai_extracted: "AI extracted",
  hr_edited: "HR edited",
  hr_created: "HR created",
};

function sourceLabel(source) {
  return SOURCE_LABEL[source] || source;
}

export default function JobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

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

  useEffect(() => {
    if (!id) return;
    let active = true;
    setProfilesLoading(true);
    listJobProfiles(id)
      .then((data) => {
        if (!active) return;
        setProfiles(data || []);
      })
      .catch(() => {
        if (!active) return;
        setProfileError("Could not load job profiles from the backend.");
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const reloadProfiles = () => {
    setProfilesLoading(true);
    setProfileError("");
    listJobProfiles(id)
      .then((data) => setProfiles(data || []))
      .catch(() => setProfileError("Could not load job profiles from the backend."))
      .finally(() => setProfilesLoading(false));
  };

  const onExtract = async () => {
    setProfileBusy(true);
    setProfileError("");
    try {
      await extractJobProfile(id);
      reloadProfiles();
    } catch (err) {
      setProfileError(
        err?.response?.data?.detail || "AI extraction failed. Please try again."
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const onApprove = async (profileId) => {
    setProfileBusy(true);
    setProfileError("");
    try {
      await approveJobProfile(profileId);
      reloadProfiles();
    } catch (err) {
      setProfileError(
        err?.response?.data?.detail || "Could not approve this job profile."
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const currentProfile = profiles.find((p) => p.is_current);
  const approvedProfile = profiles.find((p) => p.status === "approved");
  const draftProfile = profiles.find((p) => p.status === "draft");

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

      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">AI EXTRACTION</p>
            <h3>Job Profile</h3>
          </div>
          {!profilesLoading && !approvedProfile && draftProfile && (
            <span className="muted-note">Awaiting HR approval before screening can run.</span>
          )}
          {approvedProfile && (
            <Badge status="approved" />
          )}
        </div>

        {profileError && <div className="form-error">{profileError}</div>}

        {profilesLoading ? (
          <LoadingSpinner label="Loading job profiles..." />
        ) : profiles.length === 0 ? (
          <div className="empty">
            No job profile yet. Run AI extraction to create one from this job description.
          </div>
        ) : (
          profiles
            .slice()
            .reverse()
            .map((profile) => {
              const data = profile.profile_data || {};
              const requirements = Array.isArray(data.requirements) ? data.requirements : [];
              return (
                <div className="profile-card" key={profile.id}>
                  <div className="profile-card-head">
                    <div>
                      <strong>{data.title || "Extracted Job Profile"}</strong>
                      <span className="muted-note">
                        v{profile.version_number} · {sourceLabel(profile.source)}
                        {profile.is_current ? " · current" : ""}
                      </span>
                    </div>
                    <div className="profile-card-actions">
                      <Badge status={profile.status} />
                      {profile.status === "draft" && (
                        <button
                          className="primary"
                          disabled={profileBusy}
                          onClick={() => onApprove(profile.id)}
                        >
                          <FileCheck2 size={16} /> Approve
                        </button>
                      )}
                    </div>
                  </div>

                  {data.summary && <p className="muted-note">{data.summary}</p>}

                  {requirements.length > 0 && (
                    <>
                      <h4>Requirements</h4>
                      <div className="chips">
                        {requirements.map((req) => (
                          <span className={REQUIREMENT_TONE[req.category] || "chip"} key={req.key || req.text}>
                            {req.text}
                            {req.category ? ` · ${req.category.replaceAll("_", " ")}` : ""}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })
        )}

        <div className="profile-card-actions footer-actions">
          <button
            className="btn-secondary"
            disabled={profileBusy || !job.description}
            onClick={onExtract}
            title={job.description ? "" : "No job description available to extract from."}
          >
            <Sparkles size={16} /> {currentProfile ? "Re-run AI extraction" : "Run AI extraction"}
          </button>
        </div>
      </div>
    </section>
  );
}
