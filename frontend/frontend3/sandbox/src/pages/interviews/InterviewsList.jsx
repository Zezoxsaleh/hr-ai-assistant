import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, XCircle, Calendar, Clock3, CheckCircle2, FileText } from "lucide-react";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Modal from "../../components/common/Modal";
import { getInterviews, cancelInterview } from "../../services/interviewService";

const TABS = [
  { key: "Scheduled", label: "Upcoming Interviews" },
  { key: "Completed", label: "Completed Interviews" },
  { key: "Cancelled", label: "Cancelled Interviews" },
];

const TYPE_TONE = { Technical: "blue", HR: "violet", Behavioral: "amber" };

export default function InterviewsList() {
  const [allInterviews, setAllInterviews] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState("Scheduled");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([getInterviews(), getInterviews(tab)])
      .then(([all, filtered]) => {
        setAllInterviews(all);
        setInterviews(filtered);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const scheduled = allInterviews.filter((i) => i.status === "Scheduled").length;
    const completed = allInterviews.filter((i) => i.status === "Completed").length;
    const today = new Date().toISOString().slice(0, 10);
    const pendingFeedback = allInterviews.filter((i) => i.status === "Scheduled" && i.date < today).length;
    return {
      thisWeek: allInterviews.filter((i) => i.status !== "Cancelled").length,
      scheduled,
      completed,
      pendingFeedback,
    };
  }, [allInterviews]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    await cancelInterview(cancelTarget.id);
    setCancelling(false);
    setCancelTarget(null);
    load();
  };

  const panelTitle = TABS.find((t) => t.key === tab)?.label || "Interviews";

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">INTERVIEWS</p>
          <h3>
            Interviews <span className="demo-notice">Demo / Placeholder</span>
          </h3>
          <p className="muted-note">{stats.thisWeek} scheduled this week</p>
        </div>
        <button className="primary" onClick={() => navigate("/interviews/schedule")}>
          <Plus size={18} /> Schedule Interview
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon tone-blue">
            <Calendar size={20} />
          </div>
          <div className="stat-info">
            <span>This Week</span>
            <strong>{stats.thisWeek}</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon tone-violet">
            <Clock3 size={20} />
          </div>
          <div className="stat-info">
            <span>Scheduled</span>
            <strong>{stats.scheduled}</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon tone-green">
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-info">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon tone-amber">
            <FileText size={20} />
          </div>
          <div className="stat-info">
            <span>Pending Feedback</span>
            <strong>{stats.pendingFeedback}</strong>
          </div>
        </div>
      </div>

      <div className="filter-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`filter-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label.replace(" Interviews", "")}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading interviews..." />
      ) : error ? (
        <ErrorState message="Unable to load interviews. Please try again." onRetry={load} />
      ) : (
        <div className="panel table-panel">
          <div className="panel-title" style={{ padding: "18px 22px 0" }}>
            <h3>{panelTitle}</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Type</th>
                  <th>Date &amp; Time</th>
                  <th>Interviewers</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="candidate-cell">
                        <div className="mini-avatar">
                          {i.candidateName
                            .split(" ")
                            .map((x) => x[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <strong>{i.candidateName}</strong>
                      </div>
                    </td>
                    <td>{i.job}</td>
                    <td>
                      <span className={`badge badge-${TYPE_TONE[i.type] || "grey"}`}>{i.type}</span>
                    </td>
                    <td>
                      <div className="date-time-cell">
                        <strong>{i.date}</strong>
                        <span>{i.time}</span>
                      </div>
                    </td>
                    <td>
                      <div className="interviewer-list">
                        {(i.interviewers || []).map((iv) => (
                          <span key={iv.name}>
                            {iv.name} <em>({iv.role})</em>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge status={i.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => navigate(`/interviews/${i.id}/feedback`)}
                        >
                          {i.status === "Completed" ? "View Feedback" : "Open Workspace"}
                        </button>
                        {i.status === "Scheduled" && (
                          <button
                            type="button"
                            title="Cancel"
                            className="danger"
                            onClick={() => setCancelTarget(i)}
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!interviews.length && (
            <EmptyState message={`No ${tab.toLowerCase()} interviews found.`} />
          )}
        </div>
      )}

      <Modal open={!!cancelTarget} title="Cancel interview?" onClose={() => setCancelTarget(null)}>
        <p>
          Cancel the interview with <strong>{cancelTarget?.candidateName}</strong> on{" "}
          {cancelTarget?.date} at {cancelTarget?.time}? This can't be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setCancelTarget(null)}>
            Keep it
          </button>
          <button className="btn btn-danger" onClick={confirmCancel} disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Cancel Interview"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
