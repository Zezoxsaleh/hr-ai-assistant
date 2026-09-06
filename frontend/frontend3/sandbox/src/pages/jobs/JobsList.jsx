import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import { getJobs, deleteJob } from "../../services/jobService";

export default function JobsList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(false);
    getJobs()
      .then((data) => {
        setJobs(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const onDelete = async (e, job) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${job.title}"? This can't be undone.`)) return;
    setDeletingId(job.id);
    try {
      await deleteJob(job.id);
    } catch (err) {
      alert(err?.response?.data?.detail || err?.message || "Unable to delete this job.");
    }
    setDeletingId(null);
    load();
  };

  if (loading) return <LoadingSpinner label="Loading jobs..." />;
  if (error) return <ErrorState message="Unable to load jobs. Please try again." onRetry={load} />;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">JOBS</p>
          <h3>Open positions</h3>
        </div>
        <button className="primary" onClick={() => navigate("/jobs/new")}>
          <Plus size={18} /> New Job
        </button>
      </div>

      {!jobs.length ? (
        <EmptyState message="No jobs posted yet." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Experience</th>
                  <th>Applicants</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="clickable" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td>
                      <strong>{job.title}</strong>
                    </td>
                    <td>{job.department}</td>
                    <td>{job.location}</td>
                    <td>{job.type}</td>
                    <td>{job.experience}</td>
                    <td>{job.applicants}</td>
                    <td>
                      <Badge status={job.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          title="View"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/jobs/${job.id}`);
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/jobs/${job.id}/edit`);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          className="danger"
                          disabled={deletingId === job.id}
                          onClick={(e) => onDelete(e, job)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
