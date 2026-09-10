import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import Badge from "../../components/common/Badge";
import RankedCandidateList, {
  CandidateCell,
  ScoreCell,
  SkillsPreview,
} from "../../components/common/RankedCandidateList";
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

  const columns = [
    {
      key: "candidate",
      header: "Candidate",
      render: (c) => <CandidateCell name={c.name} subtitle={<span>{c.email || "—"}</span>} />,
    },
    { key: "status", header: "Status", render: (c) => <Badge status={c.status} /> },
    { key: "skills", header: "Profile Skills", render: (c) => <SkillsPreview skills={c.skills} /> },
    { key: "experience", header: "Experience", render: (c) => c.experience || "—" },
    { key: "score", header: "AI Score", render: (c) => <ScoreCell score={c.score} /> },
    { key: "chevron", header: "", render: () => <ChevronRight size={17} /> },
  ];

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">EVALUATIONS</p>
          <h3>AI Evaluation Queue</h3>
        </div>
      </div>

      <RankedCandidateList
        loading={loading}
        loadingLabel="Loading evaluations..."
        error={error}
        errorMessage="Unable to load evaluations. Please try again."
        onRetry={load}
        emptyMessage="No candidates match your filters."
        columns={columns}
        rows={filtered}
        onRowClick={(c) => navigate(`/candidates/${c.id}`)}
        toolbar={
          <>
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
          </>
        }
      />
    </section>
  );
}