import React from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import ScoreBadge from "./ScoreBadge";

// Reusable score summary: circle badge + matched/partial/missing skill chips.
// Used on Matching Results rows and reusable anywhere a compact AI score
// summary is needed. All values are passed in from the backend's AI
// evaluation — this component only renders them. When no requirement
// evidence is supplied (e.g. list views whose aggregation endpoint does not
// carry evidence), it renders an honest empty state instead of fabricated
// chips.
export default function ScoreCard({
  score,
  matching = [],
  partial = [],
  missing = [],
  compact = false,
}) {
  const hasBlocks = matching.length > 0 || partial.length > 0 || missing.length > 0;
  return (
    <div className={`score-card ${compact ? "score-card-compact" : ""}`}>
      <ScoreBadge value={score} size={compact ? 40 : 56} />
      <div className="score-card-skills">
        {!hasBlocks ? (
          <span className="muted-note">No requirement evidence in this view</span>
        ) : (
          <>
            <div className="score-card-skill-row">
              <CheckCircle2 size={14} className="good-icon" />
              <div className="chips">
                {matching.slice(0, compact ? 3 : matching.length).map((s) => (
                  <span className="chip good" key={s}>
                    {s}
                  </span>
                ))}
                {compact && matching.length > 3 && <span className="chip">+{matching.length - 3}</span>}
              </div>
            </div>
            {partial.length > 0 && (
              <div className="score-card-skill-row">
                <Clock3 size={14} className="partial-icon" />
                <div className="chips">
                  {partial.slice(0, compact ? 2 : partial.length).map((s) => (
                    <span className="chip" key={s}>
                      {s}
                    </span>
                  ))}
                  {compact && partial.length > 2 && <span className="chip">+{partial.length - 2}</span>}
                </div>
              </div>
            )}
            {missing.length > 0 && (
              <div className="score-card-skill-row">
                <XCircle size={14} className="bad-icon" />
                <div className="chips">
                  {missing.slice(0, compact ? 2 : missing.length).map((s) => (
                    <span className="chip bad" key={s}>
                      {s}
                    </span>
                  ))}
                  {compact && missing.length > 2 && <span className="chip">+{missing.length - 2}</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
