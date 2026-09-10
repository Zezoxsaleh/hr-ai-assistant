import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import EvaluationsList from "./EvaluationsList";
import { getCandidates } from "../../services/candidateService";

vi.mock("../../services/candidateService", () => ({
  getCandidates: vi.fn(),
}));

const CANDIDATES = [
  {
    id: "c-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "",
    status: "active",
    title: "",
    skills: ["Python", "SQL"],
    score: null,
    experience: "3 positions",
  },
  {
    id: "c-2",
    name: "Grace Hopper",
    email: "grace@example.com",
    phone: "",
    status: "active",
    title: "",
    skills: [],
    score: null,
    experience: "",
  },
];

function PathProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/evaluations"]}>
      <EvaluationsList />
      <PathProbe />
    </MemoryRouter>
  );
}

describe("EvaluationsList (RankedCandidateList integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCandidates.mockResolvedValue(CANDIDATES);
  });

  it("renders the org-wide queue through the shared list", async () => {
    renderPage();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("3 positions")).toBeInTheDocument();
    // Org-wide rows have no per-job score yet => "Not scored".
    expect(screen.getAllByText("Not scored").length).toBeGreaterThanOrEqual(2);
  });

  it("navigates to candidate details on row click", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ada Lovelace");
    await user.click(screen.getByRole("cell", { name: /ada lovelace/i }));

    expect(screen.getByTestId("path").textContent).toBe("/candidates/c-1");
  });

  it("shows the empty state when no candidates match", async () => {
    getCandidates.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No candidates match your filters.")).toBeInTheDocument();
  });

  it("keeps search-filter semantics in the page", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ada Lovelace");
    await user.type(screen.getByPlaceholderText("Search candidates, skills..."), "grace");

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });
});