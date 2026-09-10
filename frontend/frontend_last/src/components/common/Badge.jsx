import React from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

// Matches the recruitment pipeline: Applied -> Screening -> Shortlisted ->
// Interview -> Rejected / Hired.
const TONE_BY_STATUS = {
  Applied: "amber",
  Screening: "blue",
  Shortlisted: "green",
  Interview: "violet",
  Rejected: "red",
  Hired: "purple",

  // Extra statuses used elsewhere in the app (jobs, interviews)
  Active: "green",
  Closed: "red",
  Draft: "amber",
  Scheduled: "blue",
  Approved: "green",
  Superseded: "grey",
  Completed: "grey",
  "Awaiting Profile Review": "blue",
  Archived: "grey",
  "Highly Qualified": "green",
  "Potential Candidate": "amber",
};

const ICON_BY_TONE = {
  green: CheckCircle2,
  amber: Clock3,
  red: XCircle,
  blue: Clock3,
  violet: Clock3,
  purple: CheckCircle2,
};

// Backend statuses are lowercase snake_case (e.g. "awaiting_profile_review");
// normalize to a display label so both raw and already-capitalized values
// render consistently.
function normalizeStatus(status) {
  return String(status || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Badge({ status }) {
  const label = normalizeStatus(status);
  const tone = TONE_BY_STATUS[label] || TONE_BY_STATUS[status] || "grey";
  const Icon = ICON_BY_TONE[tone] || Clock3;
  return (
    <span className={`badge badge-${tone}`}>
      <Icon size={13} />
      {label || status}
    </span>
  );
}
