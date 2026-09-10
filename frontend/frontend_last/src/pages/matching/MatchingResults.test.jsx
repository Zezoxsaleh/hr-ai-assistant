import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import MatchingResults from "./MatchingResults";
import { getJobs } from "../../services/jobService";
import { getRanking, recordPipelineDecision } from "../../services/matchingService";

// Fidelity contract for Matching Results:
//   - Scores, statuses, groups, and evidence are backend-derived values
//     displayed unchanged; nothing is computed or fabricated client-side.
//     The org-wide aggregation endpoint now carries both the backend-assigned
//     group and the backend-classified requirement evidence.
//   - A row with no evidence shows an honest empty state instead of invented
//     matched/missing chips.
//   - Decisions go through the shared PipelineActions and the existing
//     service with the unchanged { decision } payload.
//   - Status->decision highlight uses the real backend application
//     vocabulary, never the obsolete "Shortlisted / On Hold" labels.
vi.mock("../../services/matchingService", () => ({
  getRanking: vi.fn(),
  recordPipelineDecision: vi.fn(),
}));
vi.mock("../../services/jobService", () => ({
  getJobs: vi.fn(),
}));

const ADVANCE_ROW = {
  id: "app-1",
  applicationId: "app-1",
  candidateId: "c-1",
  candidateName: "Ada Lovelace",
  jobId: "j-1",
  jobTitle: "Backend Engineer",
  status: "advanced",
  score: 88,
  reviewed: true,
  group: "must_review",
  evidence: [
    { requirementKey: "python", evidenceType: "matched", text: "Python" },
    { requirementKey: "gcp", evidenceType: "partial", text: "GCP" },
    { requirementKey: "kubernetes", evidenceType: "missing", text: "Kubernetes" },
  ],
};

const HOLD_ROW = {
  id: "app-2",
  applicationId: "app-2",
  candidateId: "c-2",
  candidateName: "Grace Hopper",
  jobId: "j-1",
  jobTitle: "Backend Engineer",
  status: "hold",
  score: 60,
  reviewed: true,
  group: "consider",
  evidence: [],
};

const REJECT_ROW = {
  id: "app-3",
  applicationId: "app-3",
  candidateId: "c-3",
  candidateName: "Alan Turing",
  jobId: "j-1",
  jobTitle: "Backend Engineer",
  status: "rejected",
  score: 40,
  reviewed: true,
  group: "lower_priority",
  evidence: [{ requirementKey: "python", evidenceType: "matched", text: "Python" }],
};

const READY_ROW = {
  id: "app-4",
  applicationId: "app-4",
  candidateId: "c-4",
  candidateName: "Katherine Johnson",
  jobId: "j-1",
  jobTitle: "Backend Engineer",
  status: "ready_for_review",
  score: null,
  reviewed: false,
  group: "lower_priority",
  evidence: [],
};

const OTHER_JOB_ROW = {
  id: "app-5",
  applicationId: "app-5",
  candidateId: "c-5",
  candidateName: "Linus Pauling",
  jobId: "j-2",
  jobTitle: "Data Engineer",
  status: "hold",
  score: 75,
  reviewed: true,
  group: "must_review",
  evidence: [],
};

const jobList = [
  { id: "j-1", title: "Backend Engineer" },
  { id: "j-2", title: "Data Engineer" },
];

function renderPage(rows = [ADVANCE_ROW]) {
  getRanking.mockResolvedValue(rows);
  return render(
    <MemoryRouter>
      <MatchingResults />
    </MemoryRouter>
  );
}

function ReviewProbe() {
  const { id } = useParams();
  return <div>REVIEW_SCREEN:{id}</div>;
}

function renderWithRoutes(rows = [ADVANCE_ROW]) {
  getRanking.mockResolvedValue(rows);
  return render(
    <MemoryRouter initialEntries={["/matching-results"]}>
      <Routes>
        <Route path="/matching-results" element={<MatchingResults />} />
        <Route path="/applications/:id/review" element={<ReviewProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MatchingResults fidelity: real backend-derived data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRanking.mockResolvedValue([ADVANCE_ROW]);
    recordPipelineDecision.mockResolvedValue({});
    getJobs.mockResolvedValue(jobList);
  });

  it("displays the backend score unchanged", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("88")).toBeTruthy();
  });

  it("renders the backend evidence chips unchanged across all jobs", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("Python")).toBeTruthy();
    expect(screen.getByText("GCP")).toBeTruthy();
    expect(screen.getByText("Kubernetes")).toBeTruthy();
  });

  it("shows an honest empty evidence state instead of fabricated chips", async () => {
    renderPage([HOLD_ROW]);
    await screen.findByText("Grace Hopper");
    expect(screen.getByText("No requirement evidence in this view")).toBeTruthy();
    expect(screen.queryByText(/Python/i)).toBeNull();
    expect(screen.queryByText(/Kubernetes/i)).toBeNull();
  });

  it("renders the backend group unchanged org-wide", async () => {
    renderPage([ADVANCE_ROW, READY_ROW]);
    await screen.findByText("Ada Lovelace");
    expect(within(screen.getByText("Must Review").closest(".recommendation")).getByText("Must Review")).toBeTruthy();
    expect(screen.getByText("Lower Priority")).toBeTruthy();
  });

  it("shows no group pill when a row has no group", async () => {
    renderPage([{ ...OTHER_JOB_ROW, group: "" }]);
    await screen.findByText("Linus Pauling");
    expect(screen.queryByText("Must Review")).toBeNull();
    expect(screen.queryByText("Lower Priority")).toBeNull();
  });
});

describe("MatchingResults pipeline actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRanking.mockResolvedValue([ADVANCE_ROW]);
    recordPipelineDecision.mockResolvedValue({});
    getJobs.mockResolvedValue(jobList);
  });

  it("submits an advance decision with the same payload via PipelineActions", async () => {
    const user = userEvent.setup();
    renderPage();

    const advance = await screen.findByRole("button", { name: /advance/i });
    expect(advance.className).toContain("btn-shortlist");
    await user.click(advance);

    await waitFor(() => expect(recordPipelineDecision).toHaveBeenCalledWith("app-1", "advance"));
    expect(recordPipelineDecision).toHaveBeenCalledTimes(1);
  });

  it("submits a hold decision with the same payload via PipelineActions", async () => {
    const user = userEvent.setup();
    renderPage([HOLD_ROW]);

    await screen.findByRole("button", { name: /hold/i });
    const hold = screen.getByRole("button", { name: /hold/i });
    expect(hold.className).toContain("btn-hold");
    await user.click(hold);

    await waitFor(() => expect(recordPipelineDecision).toHaveBeenCalledWith("app-2", "hold"));
  });

  it("submits a reject decision with the same payload via PipelineActions", async () => {
    const user = userEvent.setup();
    renderPage([REJECT_ROW]);

    await screen.findByRole("button", { name: /reject/i });
    const reject = screen.getByRole("button", { name: /reject/i });
    expect(reject.className).toContain("btn-reject");
    await user.click(reject);

    await waitFor(() => expect(recordPipelineDecision).toHaveBeenCalledWith("app-3", "reject"));
  });

  it("highlights the shortcut matching the real backend status -> decision map", async () => {
    renderPage();

    await screen.findByRole("button", { name: /advance/i });
    expect(screen.getByRole("button", { name: /advance/i }).classList.contains("active")).toBe(true);
    expect(screen.getByRole("button", { name: /hold/i }).classList.contains("active")).toBe(false);
    expect(screen.getByRole("button", { name: /reject/i }).classList.contains("active")).toBe(false);
  });

  it("does not highlight any action for statuses without a decision", async () => {
    renderPage([READY_ROW]);

    await screen.findByRole("button", { name: /hold/i });
    expect(screen.getByRole("button", { name: /advance/i }).classList.contains("active")).toBe(false);
    expect(screen.getByRole("button", { name: /hold/i }).classList.contains("active")).toBe(false);
    expect(screen.getByRole("button", { name: /reject/i }).classList.contains("active")).toBe(false);
  });

  it("does not use the obsolete Shortlisted / On Hold status vocabulary", async () => {
    renderPage([ADVANCE_ROW, HOLD_ROW, REJECT_ROW]);

    await screen.findByText("Ada Lovelace");
    expect(screen.queryByText("Shortlisted")).toBeNull();
    expect(screen.queryByText("On Hold")).toBeNull();
  });
});

describe("MatchingResults filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRanking.mockResolvedValue([ADVANCE_ROW, HOLD_ROW, OTHER_JOB_ROW]);
    recordPipelineDecision.mockResolvedValue({});
    getJobs.mockResolvedValue(jobList);
  });

  it("filters rows by job", async () => {
    const user = userEvent.setup();
    renderPage([ADVANCE_ROW, OTHER_JOB_ROW]);

    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("Linus Pauling")).toBeTruthy();

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "j-2");

    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByText("Linus Pauling")).toBeTruthy();
  });

  it("filters rows by minimum score and hides unscored candidates", async () => {
    const user = userEvent.setup();
    renderPage([ADVANCE_ROW, HOLD_ROW, READY_ROW]);

    await screen.findByText("Ada Lovelace");
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "85");

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Grace Hopper")).toBeNull();
    expect(screen.queryByText("Katherine Johnson")).toBeNull();
  });
});

describe("MatchingResults row navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRanking.mockResolvedValue([ADVANCE_ROW]);
    recordPipelineDecision.mockResolvedValue({});
    getJobs.mockResolvedValue(jobList);
  });

  it("navigates to the review screen for the application", async () => {
    const user = userEvent.setup();
    renderWithRoutes([ADVANCE_ROW]);

    await screen.findByText("Ada Lovelace");
    await user.click(screen.getByText("Ada Lovelace"));

    await waitFor(() => expect(screen.getByText("REVIEW_SCREEN:app-1")).toBeTruthy());
  });
});