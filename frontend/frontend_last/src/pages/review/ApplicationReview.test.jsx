import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ApplicationReview from "./ApplicationReview";
import { getReviewWorkspace, recordDecision } from "../../services/reviewService";

// Verify the review screen keeps submitting the exact same payload through
// the shared PipelineActions component it previously sent with inline buttons:
// recordDecision(applicationId, decision, reason) -> { decision, reason }.
vi.mock("../../services/reviewService", () => ({
  getReviewWorkspace: vi.fn(),
  runEvaluation: vi.fn(),
  recordDecision: vi.fn(),
}));
vi.mock("../../services/resumeService", () => ({
  downloadResume: vi.fn(),
}));

const workspace = {
  application: {
    id: "app-1",
    status: "ready_for_review",
    created_at: "2025-01-10T00:00:00Z",
    resume_id: null,
  },
  candidate: {
    id: "c-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    location: "London",
    summary: "Full-stack engineer with 8 years of experience.",
    skills: ["Python", "React"],
  },
  job: {
    id: "j-1",
    title: "Backend Engineer",
    department: "Engineering",
  },
  evaluation: null,
  evidence: [],
  poolRow: { group: "A", decision: null },
  resume: null,
  profile: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/applications/app-1/review"]}>
      <Routes>
        <Route path="/applications/:id/review" element={<ApplicationReview />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ApplicationReview pipeline decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReviewWorkspace.mockResolvedValue(workspace);
    recordDecision.mockResolvedValue({});
  });

  it("submits { decision: 'hold', reason } via the shared component and confirmation modal", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await user.click(screen.getByRole("button", { name: /hold/i }));
    expect(screen.getByText(/Confirm HR Decision: Hold/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Enter reason for audit record/i), "waiting on references");
    await user.click(screen.getByRole("button", { name: /Confirm Hold/i }));

    await waitFor(() =>
      expect(recordDecision).toHaveBeenCalledWith("app-1", "hold", "waiting on references")
    );
  });

  it("submits { decision: 'advance' } with an empty reason", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await user.click(screen.getByRole("button", { name: /advance/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Advance/i }));

    await waitFor(() => expect(recordDecision).toHaveBeenCalledWith("app-1", "advance", ""));
  });

  it("does not submit anything when a decision is cancelled", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await user.click(screen.getByRole("button", { name: /reject/i }));
    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(recordDecision).not.toHaveBeenCalled();
  });
});