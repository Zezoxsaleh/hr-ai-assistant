import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import ScoreBadge from "../../components/common/ScoreBadge";
import Badge from "../../components/common/Badge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import { getCandidates } from "../../services/candidateService";
import { getRecommendation } from "../../utils/evaluation";

// The Evaluations page is the AI-review queue: every candidate the AI has
// scored, sorted by score, with the matched/missing skills and recommended
// action surfaced up front — a faster triage view than the full Candidates
// list. Clicking a row opens the same Candidate Details page (which already
// has the full AI Evaluation section from Week 2).
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
      .filter((c) => `${c.name} ${c.title}`.toLowerCase().includes(search.toLowerCase()))
      .filter((c) => {
        if (minScore === "all") return true;
        if (minScore === "strong") return c.score >= 85;
        if (minScore === "consider") return c.score >= 70 && c.score < 85;
        if (minScore === "weak") return c.score < 70;
        return true;
      })
      .sort((a, b) => b.score - a.score);
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
          <option value="all">All Scores</option>
          <option value="strong">Strong Match (85+)</option>
          <option value="consider">Worth Reviewing (70-84)</option>
          <option value="weak">Weak Match (&lt;70)</option>
        </select>
      </div>

      {!filtered.length ? (
        <EmptyState message="No evaluations match your filters." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Job</th>
                  <th>Experience</th>
                  <th>AI Score</th>
                  <th>Recommendation</th>
                  <th>Matched Skills</th>
                  <th>Missing Skills</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const rec = getRecommendation(c.score);
                  return (
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
                            <span>{c.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>{c.title}</td>
                      <td>{c.experience} yrs</td>
                      <td>
                        <ScoreBadge value={c.score} />
                      </td>
                      <td>
                        <span className={`recommendation recommendation-${rec.tone}`}>
                          {rec.tone === "red" ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                          {rec.label}
                        </span>
                      </td>
                      <td>
                        <span className="mini-count good">{c.matching.length}</span>
                      </td>
                      <td>
                        <span className={`mini-count ${c.missing.length ? "bad" : "neutral"}`}>
                          {c.missing.length}
                        </span>
                      </td>
                      <td>
                        <Badge status={c.status} />
                      </td>
                      <td>
                        <ChevronRight size={17} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
