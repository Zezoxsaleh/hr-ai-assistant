import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createJob, getJobById, updateJob } from "../../services/jobService";
import LoadingSpinner from "../../components/common/LoadingSpinner";

const EMPTY_JOB = {
  title: "",
  department: "",
  location: "",
  type: "Full-time",
  experience: "",
  status: "draft",
  description: "",
  requirementsText: "",
  requiredSkillsText: "",
};

// Used for both /jobs/new (create) and /jobs/:id/edit (edit) — the only
// difference is whether we preload an existing job and call updateJob
// instead of createJob on submit.
export default function JobForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [job, setJob] = useState(EMPTY_JOB);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getJobById(id).then((data) => {
      if (!data) {
        setLoading(false);
        return;
      }
      setJob({
        title: data.title || "",
        department: data.department || "",
        location: data.location || "",
        type: data.type || "Full-time",
        experience: data.experience || "",
        status: data.status || "draft",
        description: data.description || "",
        requirementsText: (data.requirements || []).join("\n"),
        requiredSkillsText: (data.requiredSkills || []).join(", "),
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  const onChange = (e) => setJob({ ...job, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      title: job.title,
      department: job.department,
      location: job.location,
      type: job.type,
      experience: job.experience,
      status: job.status,
      description: job.description,
      requirements: job.requirementsText
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
      requiredSkills: job.requiredSkillsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (isEdit) {
        await updateJob(id, payload);
        navigate(`/jobs/${id}`);
      } else {
        const created = await createJob(payload);
        navigate(`/jobs/${created?.id || "new"}`);
      }
    } catch (err) {
      // Keep the form usable if the backend is unreachable; no unhandled
      // rejection bubbles to the console.
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading job..." />;

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">JOB {isEdit ? "EDIT" : "SETUP"}</p>
            <h3>{isEdit ? "Edit Job" : "Create New Job"}</h3>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            Job Title
            <input name="title" value={job.title} onChange={onChange} required />
          </label>
          <label>
            Department
            <input name="department" value={job.department} onChange={onChange} />
          </label>
          <label>
            Location
            <input name="location" value={job.location} onChange={onChange} />
          </label>
          <label>
            Employment Type
            <select name="type" value={job.type} onChange={onChange}>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Internship</option>
            </select>
          </label>
          <label>
            Job Status
            <select name="status" value={job.status} onChange={onChange}>
              <option value="draft">Draft</option>
              <option value="active">Posted (active)</option>
            </select>
            <small className="muted-note">
              Save as a draft to keep working on it, or post it right away so
              it goes live.
            </small>
          </label>
          <label>
            Experience
            <input
              name="experience"
              value={job.experience}
              onChange={onChange}
              placeholder="e.g. 2+ years"
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              rows="4"
              value={job.description}
              onChange={onChange}
              placeholder="What this role is about..."
            />
          </label>
          <label>
            Requirements (one per line)
            <textarea
              name="requirementsText"
              rows="4"
              value={job.requirementsText}
              onChange={onChange}
              placeholder={"2+ years of experience\nComfortable with REST APIs"}
            />
          </label>
          <label>
            Required Skills (comma separated)
            <textarea
              name="requiredSkillsText"
              rows="2"
              value={job.requiredSkillsText}
              onChange={onChange}
              placeholder="C#, .NET, SQL Server, Docker"
            />
          </label>
          <button className="primary wide" type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : job.status === "active"
                ? "Publish Job"
                : "Save Draft"}
          </button>
        </form>
      </div>
    </section>
  );
}
