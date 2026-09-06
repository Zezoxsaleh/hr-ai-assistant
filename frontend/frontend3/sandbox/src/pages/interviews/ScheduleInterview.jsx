import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, Clock3, CheckCircle2 } from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import { scheduleInterview, getInterviewers } from "../../services/interviewService";
import { getCandidates } from "../../services/candidateService";
import { getJobs } from "../../services/jobService";

// TODO(backend): dates/time slots should come from the backend's
// interviewer-availability endpoint instead of being hardcoded here.
const INTERVIEW_DAYS = [
  { date: "2026-09-08", day: "Tuesday", label: "08", month: "SEP" },
  { date: "2026-09-09", day: "Wednesday", label: "09", month: "SEP" },
  { date: "2026-09-10", day: "Thursday", label: "10", month: "SEP" },
  { date: "2026-09-11", day: "Friday", label: "11", month: "SEP" },
];

const TIME_SLOTS = ["10:00 AM", "11:00 AM", "01:00 PM", "02:00 PM"];

function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ScheduleInterview() {
  const { state } = useLocation();
  const navigate = useNavigate();

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

  const selectedCandidate = useMemo(
    () => candidates.find((c) => String(c.id) === String(candidateId)),
    [candidates, candidateId]
  );
  const selectedJob = useMemo(() => jobs.find((j) => String(j.id) === String(jobId)), [jobs, jobId]);

  // Picking a candidate auto-fills their job, since that's almost always
  // what the HR user wants — they can still change it manually after.
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

    setSubmitting(true);
    try {
      const result = await scheduleInterview({
        candidate: selectedCandidate,
        job: selectedJob,
        interviewer,
        date: selectedDate,
        time: selectedTime,
      });
      setSuccess(result);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
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
          <h2>✅ Interview Scheduled</h2>
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
              <span>Candidate</span>
              <strong>{selectedCandidate?.name}</strong>
            </div>
          </div>
          <p className="muted-note">
            {selectedJob?.title} · Interviewer: {interviewer}
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
              <p>Pick the candidate, job, and interviewer.</p>
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
                <option key={i.id} value={i.name}>
                  {i.name} — {i.role}
                </option>
              ))}
            </select>
          </label>
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
              <p>All times are shown in your local timezone.</p>
            </div>
          </div>
          <div className="time-grid">
            {TIME_SLOTS.map((time) => (
              <button
                key={time}
                className={`time-option ${selectedTime === time ? "selected" : ""}`}
                onClick={() => {
                  setSelectedTime(time);
                  setError("");
                }}
                type="button"
              >
                <Clock3 size={14} /> {time}
              </button>
            ))}
          </div>
        </div>

        {selectedDate && selectedTime && (
          <div className="selected-appointment">
            <CalendarClock size={20} />
            <div>
              <span>Selected appointment</span>
              <strong>
                {formatDateLabel(selectedDate)} · {selectedTime}
              </strong>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <button className="primary wide" onClick={handleConfirm} disabled={submitting}>
          {submitting ? "Scheduling..." : "Schedule Interview"}
        </button>
      </div>
    </section>
  );
}
