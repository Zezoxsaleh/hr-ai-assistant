import apiClient from "./apiClient";
import { getApplications } from "./applicationService";

// Analytics service — computed from the same live data as the dashboard.
// No analytics-specific backend endpoints exist.

async function loadData() {
  const [apps, jobsRes] = await Promise.all([getApplications(), apiClient.get("/jobs")]);
  return {
    apps,
    jobs: Array.isArray(jobsRes.data) ? jobsRes.data : [],
  };
}

function avgScore(apps) {
  const scored = apps.filter((a) => typeof a.score === "number");
  if (!scored.length) return null;
  const mean = scored.reduce((sum, a) => sum + a.score, 0) / scored.length;
  return Math.round(mean);
}

export async function getAnalyticsMetrics() {
  const { apps, jobs } = await loadData();
  const advanced = apps.filter((a) => a.status === "advanced").length;
  const advanceRate = apps.length ? Math.round((advanced / apps.length) * 100) : 0;
  const score = avgScore(apps);

  const metrics = [
    {
      key: "applications",
      label: "Applications",
      value: apps.length,
      trend: "up",
      deltaLabel: apps.length ? "from live API" : "no data yet",
    },
    {
      key: "active_jobs",
      label: "Active Jobs",
      value: jobs.filter((j) => j.status === "active").length,
      trend: "up",
      deltaLabel: "live",
    },
  ];
  if (score !== null) {
    metrics.push({
      key: "avg_score",
      label: "Average AI Score",
      value: `${score}%`,
      trend: "up",
      deltaLabel: "best candidate score",
    });
  }
  metrics.push({
    key: "advance_rate",
    label: "Advance Rate",
    value: `${advanceRate}%`,
    trend: "up",
    deltaLabel: "of applications advanced",
  });

  return metrics;
}

export async function getAnalyticsFunnel() {
  const { apps } = await loadData();
  const sums = {
    "Applied": 0,
    "Analysis": 0,
    "Ready for Review": 0,
    "Advanced": 0,
    "Rejected": 0,
  };
  for (const a of apps) {
    if (a.status === "created") sums["Applied"] += 1;
    else if (["analysis_pending", "analyzing", "analysis_failed"].includes(a.status)) sums["Analysis"] += 1;
    else if (a.status === "ready_for_review") sums["Ready for Review"] += 1;
    else if (a.status === "advanced") sums["Advanced"] += 1;
    else if (a.status === "rejected") sums["Rejected"] += 1;
  }
  return Object.entries(sums).map(([stage, count]) => ({ stage, count }));
}

// The backend has no candidate-source data; the donut is empty until it does.
export async function getCandidateSources() {
  return [];
}