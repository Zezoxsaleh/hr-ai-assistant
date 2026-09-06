// Interview service — the backend has no interview endpoints yet, so this is a
// self-contained local store powering the Interviews pages. In-memory only:
// resets on page reload. When interview endpoints ship, swap these for API
// calls without changing the page components.

const STATIC_INTERVIEWS = [
  {
    id: "itv-1",
    candidateId: "cand-1",
    candidateName: "Omar Adel",
    candidateEmail: "omar.adel@example.com",
    jobId: "job-1",
    job: "Backend Developer",
    interviewer: "Mona Waheed",
    date: "2026-08-18",
    time: "11:00",
    status: "Scheduled",
    feedback: null,
  },
  {
    id: "itv-2",
    candidateId: "cand-2",
    candidateName: "Ahmed Ali",
    candidateEmail: "ahmed.ali@example.com",
    jobId: "job-1",
    job: "Backend Developer",
    interviewer: "Khaled Omar",
    date: "2026-08-19",
    time: "14:00",
    status: "Completed",
    feedback: {
      rating: 4,
      communication: 4,
      technical: 4,
      culturalFit: 4,
      notes: "Strong on backend fundamentals.",
      submittedAt: "2026-08-19",
    },
  },
];

const STATIC_INTERVIEWERS = ["Mona Waheed", "Khaled Omar", "Nadia Fathy", "Tarek Mostafa"];

let interviewsStore = [...STATIC_INTERVIEWS];

const delay = (ms = 200) => new Promise((res) => setTimeout(res, ms));

export async function getInterviews(status) {
  await delay();
  if (!status || status === "all") return interviewsStore;
  return interviewsStore.filter((i) => i.status === status);
}

export async function getInterviewById(id) {
  await delay();
  return interviewsStore.find((i) => String(i.id) === String(id));
}

export async function getInterviewers() {
  await delay(50);
  return STATIC_INTERVIEWERS;
}

export async function scheduleInterview({ candidate, job, interviewer, date, time }) {
  await delay(300);
  const newInterview = {
    id: `itv-${Date.now()}`,
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    jobId: job?.id,
    job: job?.title || candidate.title,
    interviewer,
    date,
    time,
    status: "Scheduled",
    feedback: null,
  };
  interviewsStore = [newInterview, ...interviewsStore];
  return newInterview;
}

export async function cancelInterview(id) {
  await delay();
  interviewsStore = interviewsStore.map((i) =>
    String(i.id) === String(id) ? { ...i, status: "Cancelled" } : i
  );
  return interviewsStore.find((i) => String(i.id) === String(id));
}

export async function submitInterviewFeedback(id, feedback) {
  await delay();
  interviewsStore = interviewsStore.map((i) =>
    String(i.id) === String(id)
      ? { ...i, status: "Completed", feedback: { ...feedback, submittedAt: new Date().toISOString().slice(0, 10) } }
      : i
  );
  return interviewsStore.find((i) => String(i.id) === String(id));
}