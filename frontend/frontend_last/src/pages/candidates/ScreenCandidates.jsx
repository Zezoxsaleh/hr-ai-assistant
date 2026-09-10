import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UploadCloud, FileText, Sparkles, Trash2, ExternalLink } from "lucide-react";
import { getJobs } from "../../services/jobService";
import { screenCandidates } from "../../services/candidateService";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

function isCvFile(file) {
  const name = (file.name || "").toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function ScreenCandidates() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState("");
  const [loadError, setLoadError] = useState("");
  const [result, setResult] = useState(null);

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
    const picked = Array.from(e.target.files || []).filter(isCvFile);
    setFiles([...files, ...picked]);
  };

  const start = async () => {
    setError("");
    setErrorType("");
    setResult(null);
    if (!jobId) {
      setError("Pick a job to screen candidates against first.");
      return;
    }
    if (!files.length) {
      setError("Please upload at least one PDF or DOCX CV.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await screenCandidates({ jobId, files });
      setResult(data);
      setFiles([]);
    } catch (err) {
      const isRateLimit =
        err?.response?.status === 429 || err?.response?.data?.error_type === "rate_limit";
      setErrorType(isRateLimit ? "rate_limit" : "");
      setError(
        isRateLimit
          ? "AI provider rate limit reached. Check the provider configuration."
          : err?.response?.data?.detail || "Could not start screening. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
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
          <input type="file" accept=".pdf,.docx,application/pdf" multiple onChange={onFilesChange} />
          <div className="upload-icon">
            <UploadCloud size={25} />
          </div>
          <strong>Drop PDF or DOCX CVs here</strong>
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

        {error && (
          <div className="form-error">
            {error}
            {errorType === "rate_limit" && (
              <div className="rate-limit-help">
                Add your own Soal API key in{" "}
                <Link to="/settings">Settings</Link> to keep screening.
              </div>
            )}
          </div>
        )}

        <button className="primary wide" onClick={start} disabled={submitting || !jobs.length}>
          <Sparkles size={18} /> {submitting ? "Starting..." : "Start AI Screening"}
        </button>
      </div>
      </section>

      {result && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">SCREENING COMPLETE</p>
              <h3>{result.screened?.length || 0} candidates screened against {result.job_title || "the selected job"}</h3>
            </div>
            <button className="btn btn-secondary" onClick={() => navigate("/candidates")}>
              View all candidates <ExternalLink size={14} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Score</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {(result.screened || []).map((row, i) => {
                  const rawScore = row.score === null || row.score === undefined ? null : Number(row.score);
                  const scoreTip = rawScore !== null && Number.isFinite(rawScore) ? Math.round(rawScore) : null;
                  return (
                    <tr key={row.application_id || i}>
                      <td>
                        <Link to={`/candidates/${row.candidate_id}`}>
                          Candidate {i + 1}
                        </Link>
                      </td>
                      <td>
                        {scoreTip !== null ? (
                          <strong className="score-text">{scoreTip}</strong>
                        ) : (
                          <span className="muted-note">Not scored</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => navigate(`/applications/${row.application_id}/review`)}
                        >
                          Open review <ExternalLink size={14} />
                        </button>
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