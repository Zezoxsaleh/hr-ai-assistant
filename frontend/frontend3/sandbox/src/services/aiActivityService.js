// AI-activity service — the backend exposes workflow runs / AI traces only by
// id (no list endpoint). This page is a static demo of the observability UI;
// it will switch to the live observability service when a listing endpoint
// ships. The demo rows mirror the WorkflowRun/AITrace vocabulary but are NOT
// fetched from the backend.

const STATIC_RUNS = [
  {
    id: "run-1",
    title: "Candidate Evaluation",
    candidateName: "Omar Adel",
    job: "Backend Developer",
    provider: "FakeAI",
    model: "fake-mini",
    timestamp: "Today, 10:42",
    totalDuration: "3.2s",
    status: "success",
    runId: "wr_55a3e7b2",
    schema: "candidate_evaluation.v2",
    prompt: "eval.fake-mini.v1",
    steps: [
      { name: "Build Evaluation Input", duration: "90ms", status: "success" },
      { name: "AI Evaluation", duration: "2.8s", status: "success" },
      { name: "Persist Result", duration: "60ms", status: "success" },
    ],
  },
  {
    id: "run-2",
    title: "Candidate Profile Extraction",
    candidateName: "Ahmed Ali",
    job: "Backend Developer",
    provider: "FakeAI",
    model: "fake-mini",
    timestamp: "Today, 10:15",
    totalDuration: "4.1s",
    status: "success",
    runId: "wr_77c9e901",
    schema: "candidate_profile_extraction.v1",
    prompt: "cpe.fake-mini.v1",
    steps: [
      { name: "Build Extraction Input", duration: "120ms", status: "success" },
      { name: "Extract Profile", duration: "3.6s", status: "success" },
      { name: "Validate Output", duration: "180ms", status: "success" },
    ],
  },
  {
    id: "run-3",
    title: "Job Profile Extraction",
    candidateName: "—",
    job: "Frontend Developer",
    provider: "FakeAI",
    model: "fake-mini",
    timestamp: "Yesterday, 16:20",
    totalDuration: "5.0s",
    status: "error",
    runId: "wr_02aa11cc",
    schema: "job_profile_extraction.v1",
    prompt: "jpe.fake-mini.v1",
    steps: [
      { name: "Build Extraction Input", duration: "110ms", status: "success" },
      { name: "Extract Profile", duration: "4.2s", status: "error" },
    ],
  },
];

const STATIC_LATENCY = "3.5s";

let runsStore = [...STATIC_RUNS];

const delay = (ms = 200) => new Promise((res) => setTimeout(res, ms));

export async function getAIActivityRuns() {
  await delay();
  return runsStore;
}

export async function getAIActivityStats() {
  await delay(50);
  return {
    totalRuns24h: runsStore.length,
    successful: runsStore.filter((r) => r.status === "success").length,
    failed: runsStore.filter((r) => r.status === "error").length,
    avgLatency: STATIC_LATENCY,
  };
}

export async function retryRun(id) {
  await delay(300);
  runsStore = runsStore.map((r) => (String(r.id) === String(id) ? { ...r, status: "success" } : r));
  return runsStore.find((r) => String(r.id) === String(id));
}