import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import ScoreCard from "../../components/common/ScoreCard";
import Badge from "../../components/common/Badge";
import PipelineActions from "../../components/common/PipelineActions";
import { GroupPill } from "../../components/common/RankedCandidateList";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import { getRanking, recordPipelineDecision } from "../../services/matchingService";
import { getJobs } from "../../services/jobService";

// Candidate ranking composed from the real backend application summaries.
// Every value (candidate, job, status, score, grouping band) comes from the
// API - nothing here is mocked or client-fabricated. Rows are ranked by AI
// score (descending) and filterable by job and minimum score. The summary
// carries the backend-classified requirement evidence (matched/partial/
// missing) per application, so ScoreCard renders real chips; when a row has
// no evidence it shows an honest "no evidence in this view" state instead.
//
// The row pipeline actions submit the real backend decision vocabulary
// (advance / hold / reject) — the same one the review screen records. The
// shared PipelineActions component maps a row's application status onto the
// matching decision only to drive the "active" button highlight.
const STATUS_TO_DECISION = {
  advanced: "advance",
  hold: "hold",
  rejected: "reject",
};

// Groups the backend-classified evidence into display buckets. The backend
// already decided each item's type and label; this only re-buckets them.
export function splitEvidence(evidence = []) {
  const buckets = { matched: [], partial: [], missing: [] };
  for (const item of evidence) {
    const bucket = item?.evidenceType;
    if (buckets[bucket]) buckets[bucket].push(item?.text || item?.requirementKey || "");
  }
  return buckets;
}

export default function MatchingResults() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [jobFilter, setJobFilter] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [skillSearch, setSkillSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([getRanking(), getJobs()])
      .then(([r, j]) => {
        setRows(r);
        setJobs(j);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const onDecision = async (row, decision) => {
    setUpdatingId(row.applicationId);
    setActionError(null);
    try {
      await recordPipelineDecision(row.applicationId, decision);
      load();
    } catch {
      setActionError(`Could not record ${decision} for ${row.candidateName}. Please try again.`);
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return rows
      .filter((r) => jobFilter === "all" || String(r.jobId) === String(jobFilter))
      .filter((r) => minScore === 0 || (r.score !== null && r.score >= minScore))
      .filter((r) =>
        skillSearch
          ? `${r.candidateName} ${r.jobTitle} ${r.status}`.toLowerCase().includes(skillSearch.toLowerCase())
          : true
      )
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1; // unscored candidates sink to the bottom
        if (b.score === null) return -1;
        return b.score - a.score;
      });
  }, [rows, jobFilter, minScore, skillSearch]);

  if (loading) return <LoadingSpinner label="Loading matching results..." />;
  if (error) return <ErrorState message="Unable to load matching results. Please try again." onRetry={load} />;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">MATCHING RESULTS</p>
          <h3>Candidate Ranking</h3>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            placeholder="Search by candidate, job, or status..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
          />
        </div>
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
          <option value="all">All Jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>Any Score</option>
          <option value={70}>70+ (Worth Reviewing)</option>
          <option value={85}>85+ (Strong Match)</option>
        </select>
      </div>

      {actionError && <p className="form-error">{actionError}</p>}

      {!filtered.length ? (
        <EmptyState message="No candidates match your filters." />
      ) : (
        <div className="ranking-list">
          {filtered.map((r, i) => {
            const evidence = splitEvidence(r.evidence);
            return (
              <div
                className="panel ranking-row clickable"
                key={r.id}
                onClick={() => navigate(`/applications/${r.applicationId}/review`)}
              >
                <div className="ranking-rank">{r.score === null ? "—" : `#${i + 1}`}</div>

                <div className="ranking-candidate">
                  <div className="mini-avatar">
                    {r.candidateName
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div>
                    <strong>{r.candidateName}</strong>
                    <span>{r.jobTitle}</span>
                  </div>
                </div>

                <ScoreCard
                  score={r.score}
                  matching={evidence.matched}
                  partial={evidence.partial}
                  missing={evidence.missing}
                  compact
                />

                {r.group ? <GroupPill group={r.group} /> : null}

                <Badge status={r.status} />

                <div onClick={(e) => e.stopPropagation()}>
                  <PipelineActions
                    currentStatus={STATUS_TO_DECISION[r.status]}
                    onDecision={(decision) => onDecision(r, decision)}
                    size="small"
                    disabled={updatingId === r.applicationId}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
