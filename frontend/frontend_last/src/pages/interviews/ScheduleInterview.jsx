import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, Clock3, CheckCircle2, AlertCircle } from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import {
  scheduleInterview,
  getInterviewers,
  getInterviewSlots,
} from "../../services/interviewService";
import { listQuestionSets } from "../../services/interviewQuestionSetService";
import { getCandidates } from "../../services/candidateService";
import { getJobs } from "../../services/jobService";

const TIME_SLOTS = ["10:00 AM", "11:00 AM", "01:00 PM", "02:00 PM"];
const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
  { value: "90", label: "90 min" },
  { value: "120", label: "120 min" },
];

// "1:30 PM" -> 810 (minutes since midnight) — mirrors the backend helper.
function toMinutes(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
}

// The next four weekdays, computed from today — UTC dates avoid timezone drift.
function nextWeekdays(count = 4) {
  const days = [];
  const current = new Date();
  current.setUTCHours(0, 0, 0, 0);
  while (days.length < count) {
    const dow = current.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push({
        date: current.toISOString().slice(0, 10),
        day: current.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
        label: String(current.getUTCDate()).padStart(2, "0"),
        month: current.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
      });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

const INTERVIEW_DAYS = nextWeekdays();

function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ScheduleInterview() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const applicationId = searchParams.get("applicationId");
  const presetQuestionSetId = searchParams.get("questionSetId");

  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [candidateId, setCandidateId] = useState(state?.candidate?.id ? String(state.candidate.id) : "");
  const [jobId, setJobId] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [questionSets, setQuestionSets] = useState([]);
  const [questionSetId, setQuestionSetId] = useState(presetQuestionSetId || "");
  const [duration, setDuration] = useState("60");

  const [occupied, setOccupied] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const loadOptions = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([getCandidates(), getJobs(), getInterviewers()])
      .then(([cands, jobList, interviewerList]) => {
        setCandidates(cands);
        setJobs(jobList);
        setInterviewers(interviewerList);
        if (state?.candidate?.jobId) setJobId(String(state.candidate.jobId));
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(loadOptions, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the application's question sets so HR can attach an approved one.
  useEffect(() => {
    let active = true;
    if (!applicationId) {
      setQuestionSets([]);
      return undefined;
    }
    listQuestionSets(applicationId)
      .then(({ questionSets: sets }) => {
        if (!active) return;
        setQuestionSets(sets);
        const approved = sets.filter((s) => s.status === "approved");
        const preset = sets.find(
          (s) => String(s.id) === String(presetQuestionSetId) && s.status === "approved"
        );
        setQuestionSetId(preset ? preset.id : approved[0]?.id || "");
      })
      .catch(() => {
        if (active) setQuestionSets([]);
      });
    return () => {
      active = false;
    };
  }, [applicationId, presetQuestionSetId]);

  // Pull the interviewer's occupied windows for the picked day.
  useEffect(() => {
    let active = true;
    setOccupied([]);
    setSlotsError("");
    if (!selectedDate || !interviewer) {
      return undefined;
    }
    setSlotsLoading(true);
    getInterviewSlots(selectedDate, interviewer)
      .then((result) => {
        if (!active) return;
        setOccupied(result.occupied || []);
      })
      .catch(() => {
        if (active) setSlotsError("Could not load availability for this day.");
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, interviewer]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => String(c.id) === String(candidateId)),
    [candidates, candidateId]
  );
  const selectedJob = useMemo(() => jobs.find((j) => String(j.id) === String(jobId)), [jobs, jobId]);
  const selectedInterviewer = useMemo(
    () => interviewers.find((i) => String(i.id) === String(interviewer)),
    [interviewers, interviewer]
  );
  const selectedQuestionSet = useMemo(
    () => questionSets.find((s) => String(s.id) === String(questionSetId)),
    [questionSets, questionSetId]
  );

  const isBlocked = (time) => {
    const start = toMinutes(time);
    if (start === null) return false;
    const end = start + Number(duration);
    return occupied.some((slot) => start < slot.endMinutes && slot.startMinutes < end);
  };

  const selectedSlotBlocked = useMemo(() => {
    if (!selectedTime) return false;
    return isBlocked(selectedTime);
  }, [selectedTime, occupied, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // If availability loaded and clears our pick, drop the conflict.
  useEffect(() => {
    if (selectedTime && selectedSlotBlocked) setSelectedTime("");
  }, [selectedSlotBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const approvedSets = questionSets.filter((s) => s.status === "approved");

  const onCandidateChange = (e) => {
    const id = e.target.value;
    setCandidateId(id);
    const cand = candidates.find((c) => String(c.id) === String(id));
    if (cand?.jobId) setJobId(String(cand.jobId));
  };

  const handleConfirm = async () => {
    setError("");
    if (!candidateId) return setError("Please select a candidate.");
    if (!jobId) return setError("Please select a job.");
    if (!interviewer) return setError("Please select an interviewer.");
    if (!selectedDate || !selectedTime) return setError("Please select a date and time.");
    if (selectedSlotBlocked) return setError("That time conflicts with an existing interview. Pick another slot.");
    if (!selectedCandidate || !selectedJob) return setError("Please select a candidate and job first.");

    setSubmitting(true);
    try {
      const result = await scheduleInterview({
        candidate: selectedCandidate,
        job: selectedJob,
        interviewer,
        date: selectedDate,
        time: selectedTime,
        durationMinutes: Number(duration),
        questionSetId: questionSetId || null,
      });
      setSuccess(result);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading scheduling options..." />;
  if (loadError) {
    return (
      <ErrorState message="Unable to load scheduling options. Please try again." onRetry={loadOptions} />
    );
  }

  if (success) {
    return (
      <section>
        <div className="panel success-card">
          <div className="success-icon">
            <CheckCircle2 size={30} />
          </div>
          <h2>Interview Scheduled</h2>
          <div className="appointment-card">
            <div>
              <span>Date</span>
              <strong>{formatDateLabel(selectedDate)}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{selectedTime}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{duration} min</strong>
            </div>
            <div>
              <span>Candidate</span>
              <strong>{selectedCandidate?.name}</strong>
            </div>
          </div>
          <p className="muted-note">
            {selectedJob?.title} · Interviewer: {selectedInterviewer?.name || ""}
            {selectedQuestionSet ? ` · v${selectedQuestionSet.versionNumber} question set` : ""}
          </p>
          <div className="modal-actions">
            <button className="primary" onClick={() => navigate("/interviews")}>
              Back to Interviews
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">INTERVIEW SCHEDULING</p>
            <h3>Schedule an interview</h3>
          </div>
        </div>

        <div className="schedule-section">
          <div className="section-title">
            <span className="step">1</span>
            <div>
              <h4>Who's interviewing?</h4>
              <p>Pick the candidate, job, interviewer, and optional question set.</p>
            </div>
          </div>

          <label>
            Candidate
            <select value={candidateId} onChange={onCandidateChange}>
              <option value="">Select a candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Job
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Select a job...</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Interviewer
            <select value={interviewer} onChange={(e) => setInterviewer(e.target.value)}>
              <option value="">Select an interviewer...</option>
              {interviewers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Duration
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {applicationId && (
            <label>
              Question Set
              <select value={questionSetId} onChange={(e) => setQuestionSetId(e.target.value)}>
                {approvedSets.length === 0 && <option value="">No approved question set</option>}
                {approvedSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    v{set.versionNumber} · {set.questions.length} questions
                  </option>
                ))}
              </select>
              {approvedSets.length > 0 ? (
                <span className="muted-note" style={{ fontSize: 12 }}>
                  Only approved sets can be attached to the interview.
                </span>
              ) : (
                <span className="muted-note" style={{ fontSize: 12 }}>
                  No approved question set for this application. Generate and approve one first.
                </span>
              )}
            </label>
          )}
        </div>

        <div className="schedule-section">
          <div className="section-title">
            <span className="step">2</span>
            <div>
              <h4>Select a date</h4>
              <p>Choose a convenient day for the interview.</p>
            </div>
          </div>
          <div className="date-grid">
            {INTERVIEW_DAYS.map((item) => (
              <button
                key={item.date}
                className={`date-option ${selectedDate === item.date ? "selected" : ""}`}
                onClick={() => {
                  setSelectedDate(item.date);
                  setError("");
                }}
                type="button"
              >
                <span>{item.month}</span>
                <strong>{item.label}</strong>
                <small>{item.day}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="schedule-section">
          <div className="section-title">
            <span className="step">3</span>
            <div>
              <h4>Select a time</h4>
              <p>All times are shown in your local timezone. Conflicting slots are disabled.</p>
            </div>
          </div>
          <div className="time-grid">
            {TIME_SLOTS.map((time) => {
              const blocked = isBlocked(time);
              return (
                <button
                  key={time}
                  className={`time-option ${selectedTime === time ? "selected" : ""}`}
                  onClick={() => {
                    if (blocked) return;
                    setSelectedTime(time);
                    setError("");
                  }}
                  disabled={blocked}
                  title={blocked ? "Conflicts with an existing interview" : undefined}
                  type="button"
                >
                  <Clock3 size={14} /> {time}
                </button>
              );
            })}
          </div>
          {slotsLoading && <p className="muted-note" style={{ marginTop: 8, fontSize: 12 }}>Checking availability…</p>}
          {slotsError && (
            <p className="muted-note" style={{ marginTop: 8, fontSize: 12, color: "var(--color-danger, #d92d20)" }}>
              <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
              {slotsError}
            </p>
          )}
          {!slotsLoading && !slotsError && occupied.length > 0 && (
            <p className="muted-note" style={{ marginTop: 8, fontSize: 12 }}>
              {occupied.length} occupied window{occupied.length > 1 ? "s" : ""} on this day for this interviewer —
              conflicting times are disabled.
            </p>
          )}
        </div>

        {selectedDate && selectedTime && (
          <div className="selected-appointment">
            <CalendarClock size={20} />
            <div>
              <span>Selected appointment</span>
              <strong>
                {formatDateLabel(selectedDate)} · {selectedTime} · {duration} min
              </strong>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <button
          className="primary wide"
          onClick={handleConfirm}
          disabled={submitting || selectedSlotBlocked}
        >
          {submitting ? "Scheduling..." : "Schedule Interview"}
        </button>
      </div>
    </section>
  );
}