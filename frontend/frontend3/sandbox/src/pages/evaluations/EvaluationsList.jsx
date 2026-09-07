import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import ScoreBadge from "../../components/common/ScoreBadge";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import { getCandidates } from "../../services/candidateService";

// The Evaluations page is the org-wide AI-review queue: every candidate in the
// roster, sorted by profile availability, with their extracted profile skills
// surfaced up front. Per-job screening scores (the backend's per-job
// evaluations) live behind the inspected job — this page shows the org-wide
// picture, so a score is shown only when one is available. Clicking a row
// opens the Candidate Details page (with its AI Evaluation section).
export default function EvaluationsList() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("all");
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(false);
    getCandidates()
      .then((data) => {
        setCandidates(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return candidates
      .filter((c) => `${c.name} ${c.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
      .filter((c) => {
        if (minScore === "all") return true;
        if (c.score === null || c.score === undefined) return false;
        if (minScore === "strong") return c.score >= 85;
        if (minScore === "consider") return c.score >= 70 && c.score < 85;
        if (minScore === "weak") return c.score < 70;
        return true;
      })
      .sort((a, b) => {
        const sa = a.score ?? -1;
        const sb = b.score ?? -1;
        return sb - sa || b.skills.length - a.skills.length;
      });
  }, [candidates, search, minScore]);

  if (loading) return <LoadingSpinner label="Loading evaluations..." />;
  if (error) return <ErrorState message="Unable to load evaluations. Please try again." onRetry={load} />;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">EVALUATIONS</p>
          <h3>AI Evaluation Queue</h3>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            placeholder="Search candidates, skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
          <option value="all">All Candidates</option>
          <option value="scored">AI-Screened Only</option>
          <option value="strong">Strong Match (85+)</option>
          <option value="consider">Worth Reviewing (70-84)</option>
          <option value="weak">Weak Match (&lt;70)</option>
        </select>
      </div>

      {!filtered.length ? (
        <EmptyState message="No candidates match your filters." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th>Profile Skills</th>
                  <th>Experience</th>
                  <th>AI Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td>
                      <div className="candidate-cell">
                        <div className="mini-avatar">
                          {c.name
                            .split(" ")
                            .map((x) => x[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <strong>{c.name}</strong>
                          <span>{c.email || "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge status={c.status} />
                    </td>
                    <td>
                      <div className="skill-preview">
                        {c.skills.length ? (
                          c.skills.slice(0, 3).map((s) => <span key={s}>{s}</span>)
                        ) : (
                          <span className="muted-note">No profile yet</span>
                        )}
                        {c.skills.length > 3 && <span>+{c.skills.length - 3}</span>}
                      </div>
                    </td>
                    <td>{c.experience || "—"}</td>
                    <td>
                      {c.score === null || c.score === undefined ? (
                        <span className="muted-note">Not scored</span>
                      ) : (
                        <ScoreBadge value={c.score} />
                      )}
                    </td>
                    <td>
                      <ChevronRight size={17} />
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
