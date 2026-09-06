import React, { useEffect, useState } from "react";
import { Sparkles, Search, ArrowRight } from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Modal from "../../components/common/Modal";
import { getTalentPool, getAIDiscovery, reengageCandidate } from "../../services/talentPoolService";
import { CandidatePoolGroup } from "../../types/api";

const evalTone = (label) => {
  if (label === "Recommend Interview") return "green";
  if (label === "Hold for Review") return "amber";
  return "red";
};

const GROUP_FILTERS = [
  { value: "all", label: "All" },
  { value: CandidatePoolGroup.MUST_REVIEW, label: "Must Review" },
  { value: CandidatePoolGroup.CONSIDER, label: "Consider" },
  { value: CandidatePoolGroup.LOWER_PRIORITY, label: "Lower Priority" },
];

export default function TalentPoolList() {
  const [pool, setPool] = useState([]);
  const [discovery, setDiscovery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [target, setTarget] = useState(null);
  const [reengaging, setReengaging] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    const params = { search: search || undefined, group: group === "all" ? undefined : group };
    Promise.all([getTalentPool(params), getAIDiscovery()])
      .then(([poolData, discoveryData]) => {
        setPool(poolData);
        setDiscovery(discoveryData);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, [search, group]);

  const filtered = pool.filter((c) =>
    `${c.name} ${c.previousJob} ${c.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  );

  const confirmReengage = async () => {
    if (!target) return;
    setReengaging(true);
    await reengageCandidate(target.id);
    setReengaging(false);
    setTarget(null);
    load();
  };

  if (loading) return <LoadingSpinner label="Loading talent pool..." />;
  if (error) return <ErrorState message="Unable to load the talent pool. Please try again." onRetry={load} />;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">TALENT POOL</p>
          <h3>{pool.length} candidates from previous searches · Re-engage strong profiles for new roles</h3>
        </div>
        <button className="primary">
          <Sparkles size={18} /> Find Candidates for Open Roles
        </button>
      </div>

      {discovery && (
        <div className="ai-discovery-banner">
          <Sparkles size={20} />
          <div>
            <strong>AI Discovery</strong>
            <p>
              {discovery.matchCount} previous candidates may fit the open{" "}
              <strong>{discovery.role}</strong> role based on their skills and previous evaluations.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => setSearch(discovery.role)}>
            Review Matches <ArrowRight size={15} />
          </button>
        </div>
      )}

      <div className="panel table-panel">
        <div className="panel-title" style={{ padding: "18px 22px 0" }}>
          <h3>All Talent Pool Candidates</h3>
          <div className="toolbar" style={{ gap: 10 }}>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              {GROUP_FILTERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <div className="search" style={{ maxWidth: 240 }}>
              <Search size={16} />
              <input
                placeholder="Search talent pool..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <EmptyState message="No talent pool candidates match your search." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Previous Job</th>
                  <th>Previous Evaluation</th>
                  <th>Skills</th>
                  <th>Potential Roles</th>
                  <th>AI Score</th>
                  <th>Last Contact</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="candidate-cell">
                        <div className="mini-avatar">
                          {c.name
                            .split(" ")
                            .map((x) => x[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <strong>{c.name}</strong>
                      </div>
                    </td>
                    <td>{c.previousJob}</td>
                    <td>
                      <span className={`recommendation recommendation-${evalTone(c.previousEvaluation)}`}>
                        {c.previousEvaluation}
                      </span>
                    </td>
                    <td>
                      <div className="skill-preview">
                        {c.skills.slice(0, 3).map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                        {c.skills.length > 3 && <span>+{c.skills.length - 3}</span>}
                      </div>
                    </td>
                    <td>{c.potentialRoles.join(", ")}</td>
                    <td>
                      <strong className={`score-text score-text-${evalTone(c.previousEvaluation)}`}>
                        {c.score}
                      </strong>
                    </td>
                    <td className="muted-note">{c.lastContactDaysAgo} days ago</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={c.reengaged}
                          onClick={() => setTarget(c)}
                        >
                          {c.reengaged ? "Re-engaged" : "Re-engage"}
                        </button>
                        <button type="button" className="btn btn-secondary btn-small">
                          View Profile
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!target} title="Re-engage candidate?" onClose={() => setTarget(null)}>
        <p>
          This will notify <strong>{target?.name}</strong> about a matching open role and move
          them back into an active pipeline.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setTarget(null)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirmReengage} disabled={reengaging}>
            {reengaging ? "Sending..." : "Re-engage"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
