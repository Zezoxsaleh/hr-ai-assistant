import React from "react";

// Colored circular score badge, e.g. for AI match scores.
// Color band: >=85 green (strong match), 70-84 amber (worth reviewing),
// <70 red (weak match). Thresholds are presentation-only — the actual
// score always comes from the backend's AI evaluation.
function toneForScore(score) {
  if (score >= 85) return "green";
  if (score >= 70) return "amber";
  return "red";
}

export default function ScoreBadge({ value, size = 40 }) {
  const tone = toneForScore(value);
  return (
    <div
      className={`score-badge score-badge-${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {value}
    </div>
  );
}
