import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import RankedCandidateList, {
  CandidateCell,
  GroupPill,
  ScoreCell,
} from "../../components/common/RankedCandidateList";
import { getTalentPool } from "../../services/talentPoolService";

const STATUS_LABEL = {
  hold: "Hold",
  advanced: "Advanced",
};

// Search/filter semantics belong to the page: the search box matches the
// human-readable group label too, while only the backend's raw group value is
// ever displayed (GroupPill owns the display mapping).
const GROUP_SEARCH_LABEL = {
  must_review: "Must Review",
  consider: "Consider",
  lower_priority: "Lower Priority",
};

export default function TalentPoolList() {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(false);
    getTalentPool()
      .then((data) => {
        setPool(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const filtered = pool.filter((c) =>
    `${c.name} ${c.jobTitle} ${GROUP_SEARCH_LABEL[c.group] || ""} ${c.status}`.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      key: "candidate",
      header: "Candidate",
      render: (c) => (
        <CandidateCell name={c.name} subtitle={c.email ? <span className="muted-note">{c.email}</span> : null} />
      ),
    },
    { key: "jobTitle", header: "Role" },
    { key: "group", header: "Group", render: (c) => <GroupPill group={c.group} /> },
    { key: "status", header: "Status", render: (c) => STATUS_LABEL[c.status] || c.status || "—" },
    { key: "score", header: "Score", render: (c) => <ScoreCell score={c.score} variant="text" /> },
    { key: "decision", header: "Decision", render: (c) => c.decision || "—" },
    {
      key: "action",
      header: "Action",
      render: (c) => (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => navigate(`/applications/${c.id}/review`)}
          >
            Review <ArrowRight size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">TALENT POOL</p>
          <h3>{pool.length} hold/advanced candidates from previous roles, ranked by evaluation score</h3>
        </div>
      </div>

      <RankedCandidateList
        loading={loading}
        loadingLabel="Loading talent pool..."
        error={error}
        errorMessage="Unable to load the talent pool. Please try again."
        onRetry={load}
        emptyMessage="No talent pool candidates match your search."
        header={
          <div className="panel-title" style={{ padding: "18px 22px 0" }}>
            <h3>All Talent Pool Candidates</h3>
            <div className="toolbar" style={{ gap: 10 }}>
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
        }
        columns={columns}
        rows={filtered}
        onRowClick={(c) => navigate(`/applications/${c.id}/review`)}
      />
    </section>
  );
}