import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/common/DataTable";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import { getApplications } from "../../services/applicationService";
import { JobApplicationStatus } from "../../types/api";

const STATUS_LABELS = {
  [JobApplicationStatus.CREATED]: "Created",
  [JobApplicationStatus.ANALYSIS_PENDING]: "Analysis Pending",
  [JobApplicationStatus.ANALYZING]: "Analyzing",
  [JobApplicationStatus.ANALYSIS_FAILED]: "Analysis Failed",
  [JobApplicationStatus.READY_FOR_REVIEW]: "Ready for Review",
  [JobApplicationStatus.HOLD]: "Hold",
  [JobApplicationStatus.ADVANCED]: "Advanced",
  [JobApplicationStatus.REJECTED]: "Rejected",
  [JobApplicationStatus.ARCHIVED]: "Archived",
};

const FILTERS = ["all", ...Object.keys(STATUS_LABELS)];

export default function ApplicationsList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(false);
    getApplications(filter)
      .then((data) => {
        setApplications(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: "candidateName", header: "Candidate" },
    { key: "job", header: "Job" },
    { key: "appliedAt", header: "Applied On" },
    { key: "score", header: "Score", render: (row) => `${row.score}%` },
    { key: "status", header: "Status", render: (row) => <Badge status={row.status} /> },
  ];

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">APPLICATIONS</p>
          <h3>All Applications</h3>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading applications..." />
      ) : error ? (
        <ErrorState message="Unable to load applications. Please try again." onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          data={applications}
          onRowClick={(row) => navigate(`/candidates/${row.candidateId}`)}
          emptyLabel="No applications in this stage."
        />
      )}
    </section>
  );
}
