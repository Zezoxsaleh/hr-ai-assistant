import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileText, Sparkles, Trash2 } from "lucide-react";
import { getJobs } from "../../services/jobService";
import { screenCandidates } from "../../services/candidateService";

export default function ScreenCandidates() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getJobs()
      .then((list) => {
        setJobs(list || []);
        const firstActive = (list || []).find((j) => String(j.status).toLowerCase() === "active");
        setJobId(firstActive?.id || list?.[0]?.id || "");
      })
      .catch(() => setLoadError("Couldn't load your jobs from the backend. Try again."));
  }, []);

  const selectedJob = jobs.find((j) => String(j.id) === String(jobId));

  const onFilesChange = (e) => {
    const picked = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf");
    setFiles([...files, ...picked]);
  };

  const start = async () => {
    setError("");
    if (!jobId) {
      setError("Pick a job to screen candidates against first.");
      return;
    }
    if (!files.length) {
      setError("Please upload at least one PDF CV.");
      return;
    }
    setSubmitting(true);
    try {
      await screenCandidates({ jobId, files });
      navigate("/candidates");
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Could not start screening. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">JOB SETUP</p>
            <h3>Create Screening</h3>
          </div>
          <span className="step">1 / 2</span>
        </div>
        <label>
          Job
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={submitting}
          >
            {!jobId && <option value="">Select a job…</option>}
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
                {String(job.status).toLowerCase() !== "active"
                  ? ` (${job.status})`
                  : ""}
                {job.location ? ` — ${job.location}` : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedJob && (
          <div>
            <p className="muted-note">
              {selectedJob.description || "No description saved for this job."}
            </p>
            {selectedJob.requiredSkills?.length > 0 && (
              <p className="muted-note">
                <strong>Required skills:</strong> {selectedJob.requiredSkills.join(", ")}
              </p>
            )}
          </div>
        )}

        {loadError && <div className="form-error">{loadError}</div>}
      </div>

      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">CV UPLOAD</p>
            <h3>Upload resumes</h3>
          </div>
          <span className="count">{files.length} files</span>
        </div>

        <label className="dropzone">
          <input type="file" accept=".pdf,application/pdf" multiple onChange={onFilesChange} />
          <div className="upload-icon">
            <UploadCloud size={25} />
          </div>
          <strong>Drop PDF CVs here</strong>
          <span>or click to browse · Multiple files supported</span>
        </label>

        <div className="file-list">
          {files.map((f, i) => (
            <div className="file" key={i}>
              <FileText size={18} />
              <div>
                <strong>{f.name}</strong>
                <span>{(f.size / 1024).toFixed(1)} KB</span>
              </div>
              <button onClick={() => setFiles(files.filter((_, x) => x !== i))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        <button className="primary wide" onClick={start} disabled={submitting || !jobs.length}>
          <Sparkles size={18} /> {submitting ? "Starting..." : "Start AI Screening"}
        </button>
      </div>
    </section>
  );
}