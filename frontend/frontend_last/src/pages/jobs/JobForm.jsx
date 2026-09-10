import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createJob,
  getJobById,
  suggestJobDraft,
  updateJob,
} from "../../services/jobService";
import { extractJobProfile } from "../../services/jobProfileService";
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

// The employment-type select preselects Full-time so an untouched default reads
// as "not chosen yet" to the HERA auto-fill.
const DEFAULT_JOB_TYPE = "Full-time";

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

  // Advisory HERA auto-fill ("Fill with HERA") doesn't persist anything; it
  // only pre-fills empty fields, all of which stay fully editable.
  const [fillStatus, setFillStatus] = useState("idle"); // idle|analyzing|ready|incomplete|error
  const [fillError, setFillError] = useState("");
  const [aiFields, setAiFields] = useState(() => new Set());

  // Saved identity: a created (or edited) job keeps the form page open so the
  // next step ("Analyze with HERA", which opens the job review) is explicit.
  const [savedId, setSavedId] = useState(isEdit ? id : null);
  const [savedMessage, setSavedMessage] = useState("");
  const [analyzStatus, setAnalyzStatus] = useState("idle"); // idle|running|error
  const [analyzError, setAnalyzError] = useState("");

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
        type: data.type || DEFAULT_JOB_TYPE,
        experience: data.experience || "",
        status: data.status || "draft",
        description: data.description || "",
        requirementsText: (data.requirements || []).join("\n"),
        requiredSkillsText: (data.requiredSkills || []).join(", "),
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  function isFieldEmpty(name) {
    switch (name) {
      case "title":
        return !job.title;
      case "department":
        return !job.department;
      case "location":
        return !job.location;
      case "type":
        return !job.type || job.type === DEFAULT_JOB_TYPE;
      case "experience":
        return !job.experience;
      case "requirementsText":
        return !job.requirementsText;
      case "requiredSkillsText":
        return !job.requiredSkillsText;
      default:
        return false;
    }
  }

  const onChange = (e) => {
    const name = e.target.name;
    setJob({ ...job, [name]: e.target.value });
    if (aiFields.has(name)) {
      const next = new Set(aiFields);
      next.delete(name);
      setAiFields(next);
    }
  };

  const onFill = async () => {
    if (!job.description) {
      setFillStatus("incomplete");
      return;
    }
    setFillStatus("analyzing");
    setFillError("");

    try {
      const suggestion = await suggestJobDraft(job.description);
      const applied = {};
      const appliedNames = [];
      if (isFieldEmpty("title") && suggestion.title) {
        applied.title = suggestion.title;
        appliedNames.push("title");
      }
      if (isFieldEmpty("department") && suggestion.department) {
        applied.department = suggestion.department;
        appliedNames.push("department");
      }
      if (isFieldEmpty("location") && suggestion.location) {
        applied.location = suggestion.location;
        appliedNames.push("location");
      }
      if (isFieldEmpty("type") && suggestion.type) {
        applied.type = suggestion.type;
        appliedNames.push("type");
      }
      if (isFieldEmpty("experience") && suggestion.experience) {
        applied.experience = suggestion.experience;
        appliedNames.push("experience");
      }
      if (isFieldEmpty("requirementsText") && suggestion.requirements.length) {
        applied.requirementsText = suggestion.requirements.join("\n");
        appliedNames.push("requirementsText");
      }
      if (isFieldEmpty("requiredSkillsText") && suggestion.requiredSkills.length) {
        applied.requiredSkillsText = suggestion.requiredSkills.join(", ");
        appliedNames.push("requiredSkillsText");
      }

      if (!appliedNames.length) {
        setFillStatus("incomplete");
        return;
      }
      setJob((current) => ({ ...current, ...applied }));
      setAiFields(
        (current) => new Set([...Array.from(current), ...appliedNames])
      );
      setFillStatus("ready");
    } catch (error) {
      setFillStatus("error");
      setFillError(error?.message || "HERA could not read the description.");
    }
  };

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
        setSavedId(id);
        setSavedMessage("Job updated. Analyze it with HERA to build or refresh its profile.");
      } else {
        const created = await createJob(payload);
        setSavedId(created?.id);
        setSavedMessage("Job saved as a draft. Analyze it with HERA to build its profile.");
      }
    } catch {
      // Keep the form usable if the backend is unreachable; no unhandled
      // rejection bubbles to the console.
    } finally {
      setSaving(false);
    }
  };

  const onAnalyze = async () => {
    const targetId = savedId;
    if (!targetId) return;
    setAnalyzStatus("running");
    setAnalyzError("");
    try {
      await extractJobProfile(targetId);
      navigate(`/jobs/${targetId}`);
    } catch (error) {
      setAnalyzStatus("error");
      setAnalyzError(
        error?.message || "HERA could not analyse this job. It needs a description."
      );
    }
  };

  if (loading) return <LoadingSpinner label="Loading job..." />;

  const fillButtonLabel =
    fillStatus === "analyzing"
      ? "HERA is reading the description..."
      : "Fill with HERA";

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">JOB {isEdit ? "EDIT" : "SETUP"}</p>
            <h3>{isEdit ? "Edit Job" : "Create New Job"}</h3>
          </div>
        </div>

        <div className="hera-toolbar">
          <button
            className="secondary"
            type="button"
            onClick={onFill}
            disabled={fillStatus === "analyzing" || !job.description}
          >
            {fillButtonLabel}
          </button>
          {(isEdit || savedId) && (
            <button
              className="primary"
              type="button"
              onClick={onAnalyze}
              disabled={analyzStatus === "running"}
            >
              {analyzStatus === "running"
                ? "HERA is analysing the job..."
                : "Analyze with HERA"}
            </button>
          )}
        </div>

        {fillStatus === "analyzing" && (
          <p className="hera-note" role="status">
            HERA is suggesting form fields from your description. Nothing is
            saved until you click Save.
          </p>
        )}
        {fillStatus === "ready" && (
          <p className="hera-note" role="status">
            HERA filled the empty fields below. Every suggested value is marked
            <span className="ai-chip">AI</span> and stays editable until you
            change it.
          </p>
        )}
        {fillStatus === "incomplete" && (
          <p className="hera-note" role="status">
            HERA did not detect new values for the empty fields. Try a fuller
            job description.
          </p>
        )}
        {fillStatus === "error" && (
          <p className="hera-note hera-error" role="status">
            {fillError}
          </p>
        )}
        {savedMessage && fillStatus !== "analyzing" && (
          <p className="hera-note" role="status">
            {savedMessage} Run Analyze with HERA to build a profile from the
            description.
          </p>
        )}
        {analyzStatus === "error" && (
          <p className="hera-note hera-error" role="status">
            {analyzError}
          </p>
        )}

        <form onSubmit={onSubmit}>
          <label>
            Job Title
            {aiFields.has("title") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
            <input name="title" value={job.title} onChange={onChange} required />
          </label>
          <label>
            Department
            {aiFields.has("department") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
            <input name="department" value={job.department} onChange={onChange} />
          </label>
          <label>
            Location
            {aiFields.has("location") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
            <input name="location" value={job.location} onChange={onChange} />
          </label>
          <label>
            Employment Type
            {aiFields.has("type") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
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
              Save as a draft, run Analyze with HERA, then approve the profile
              on the job page to publish it.
            </small>
          </label>
          <label>
            Experience
            {aiFields.has("experience") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
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
              placeholder="Describe the role; HERA uses this to suggest fields and build the job profile..."
            />
          </label>
          <label>
            Requirements (one per line)
            {aiFields.has("requirementsText") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
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
            {aiFields.has("requiredSkillsText") && (
              <span className="ai-chip" aria-label="Suggested by HERA">
                AI
              </span>
            )}
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
              : isEdit
                ? "Save Changes"
                : "Save Draft"}
          </button>
        </form>
      </div>
    </section>
  );
}